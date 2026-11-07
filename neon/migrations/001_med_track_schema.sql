CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  nfc_token_hash text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  remaining_count integer NOT NULL DEFAULT 0 CHECK (remaining_count >= 0),
  reorder_at integer NOT NULL DEFAULT 5 CHECK (reorder_at >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  scheduled_time time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dose_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dose_date date NOT NULL,
  scheduled_time time NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  medicines_taken jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'button'
    CHECK (source IN ('button', 'nfc', 'manual')),
  UNIQUE (user_id, dose_date, scheduled_time)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS medicines_user_id_idx
  ON public.medicines(user_id);
CREATE INDEX IF NOT EXISTS schedule_entries_user_id_idx
  ON public.schedule_entries(user_id);
CREATE INDEX IF NOT EXISTS schedule_entries_user_time_idx
  ON public.schedule_entries(user_id, scheduled_time);
CREATE INDEX IF NOT EXISTS dose_logs_user_date_idx
  ON public.dose_logs(user_id, dose_date);

GRANT USAGE ON SCHEMA public TO authenticated, anonymous;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.profiles, public.medicines, public.schedule_entries,
     public.dose_logs, public.push_subscriptions
  TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_own ON public.profiles
  FOR ALL TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY medicines_own ON public.medicines
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY schedule_entries_own ON public.schedule_entries
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY dose_logs_own ON public.dose_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY push_subscriptions_own ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.take_current_dose_as_user(
  p_user_id uuid,
  p_timezone text DEFAULT 'America/Chicago',
  p_source text DEFAULT 'button'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_now_time time;
  v_today date;
  v_dose_date date;
  v_slot time;
  v_med record;
  v_deducted jsonb := '[]'::jsonb;
  v_low jsonb := '[]'::jsonb;
  v_new_count int;
  v_source text := CASE
    WHEN lower(coalesce(p_source, 'button')) = 'nfc' THEN 'nfc'
    WHEN lower(coalesce(p_source, 'button')) = 'manual' THEN 'manual'
    ELSE 'button'
  END;
  v_tz text := COALESCE(NULLIF(trim(p_timezone), ''), 'America/Chicago');
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.profiles (id, timezone)
  VALUES (p_user_id, v_tz)
  ON CONFLICT (id) DO UPDATE
    SET timezone = EXCLUDED.timezone, updated_at = now();

  v_now_time := (timezone(v_tz, now()))::time;
  v_today := (timezone(v_tz, now()))::date;

  SELECT se.scheduled_time,
         CASE
           WHEN se.scheduled_time <= v_now_time THEN v_today
           ELSE v_today - 1
         END
    INTO v_slot, v_dose_date
  FROM public.schedule_entries se
  WHERE se.user_id = p_user_id
  ORDER BY (
    CASE
      WHEN se.scheduled_time <= v_now_time THEN (v_today + se.scheduled_time)
      ELSE ((v_today - 1) + se.scheduled_time)
    END
  ) DESC
  LIMIT 1;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'no_slot',
      'message', 'No scheduled dose for this time of day yet.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dose_logs
    WHERE user_id = p_user_id
      AND dose_date = v_dose_date
      AND scheduled_time = v_slot
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already_taken',
      'scheduled_time', v_slot::text,
      'dose_date', v_dose_date::text,
      'message', 'This dose was already taken.'
    );
  END IF;

  FOR v_med IN
    SELECT m.id AS medicine_id, m.name, m.remaining_count, m.reorder_at
    FROM public.schedule_entries se
    JOIN public.medicines m ON m.id = se.medicine_id
    WHERE se.user_id = p_user_id AND se.scheduled_time = v_slot
    ORDER BY se.sort_order, se.id
  LOOP
    UPDATE public.medicines
    SET remaining_count = GREATEST(0, remaining_count - 1),
        updated_at = now()
    WHERE id = v_med.medicine_id AND user_id = p_user_id
    RETURNING remaining_count INTO v_new_count;

    v_deducted := v_deducted || jsonb_build_array(jsonb_build_object(
      'id', v_med.medicine_id,
      'name', v_med.name,
      'remaining_count', v_new_count
    ));

    IF v_new_count <= v_med.reorder_at THEN
      v_low := v_low || jsonb_build_array(jsonb_build_object(
        'id', v_med.medicine_id,
        'name', v_med.name,
        'remaining_count', v_new_count,
        'reorder_at', v_med.reorder_at
      ));
    END IF;
  END LOOP;

  INSERT INTO public.dose_logs (
    user_id, dose_date, scheduled_time, medicines_taken, source
  )
  VALUES (p_user_id, v_dose_date, v_slot, v_deducted, v_source);

  RETURN jsonb_build_object(
    'status', 'ok',
    'scheduled_time', v_slot::text,
    'dose_date', v_dose_date::text,
    'deducted', v_deducted,
    'low_stock', v_low,
    'source', v_source
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.take_current_dose(
  p_timezone text DEFAULT 'America/Chicago',
  p_source text DEFAULT 'button'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN public.take_current_dose_as_user(auth.uid(), p_timezone, p_source);
END;
$$;

CREATE OR REPLACE FUNCTION public.take_dose_by_nfc_token(
  p_token text,
  p_timezone text DEFAULT 'America/Chicago'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid;
  v_hash text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 20 THEN
    RAISE EXCEPTION 'Invalid NFC token';
  END IF;

  v_hash := encode(digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');
  SELECT id INTO v_uid
  FROM public.profiles
  WHERE nfc_token_hash = v_hash;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Invalid NFC token';
  END IF;

  RETURN public.take_current_dose_as_user(v_uid, p_timezone, 'nfc');
END;
$$;

CREATE OR REPLACE FUNCTION public.rotate_nfc_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hash text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) < 20 THEN
    RAISE EXCEPTION 'Token too short';
  END IF;

  v_hash := encode(digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.profiles (id, nfc_token_hash)
  VALUES (v_uid, v_hash)
  ON CONFLICT (id) DO UPDATE
    SET nfc_token_hash = EXCLUDED.nfc_token_hash, updated_at = now();
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_nfc_token()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  UPDATE public.profiles
  SET nfc_token_hash = NULL, updated_at = now()
  WHERE id = v_uid;
  RETURN jsonb_build_object('status', 'ok');
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_dose_batch(p_log_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_log public.dose_logs%ROWTYPE;
  v_med jsonb;
  v_med_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO v_log FROM public.dose_logs
  WHERE id = p_log_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dose log not found';
  END IF;

  FOR v_med IN
    SELECT * FROM jsonb_array_elements(v_log.medicines_taken)
  LOOP
    BEGIN
      v_med_id := (v_med->>'id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    UPDATE public.medicines
    SET remaining_count = remaining_count + 1, updated_at = now()
    WHERE id = v_med_id AND user_id = v_uid;
  END LOOP;

  DELETE FROM public.dose_logs WHERE id = v_log.id AND user_id = v_uid;
  RETURN jsonb_build_object('status', 'ok', 'deleted', 'batch');
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_dose_medicine(
  p_log_id uuid,
  p_medicine_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_log public.dose_logs%ROWTYPE;
  v_remaining jsonb := '[]'::jsonb;
  v_found boolean := false;
  v_med jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT * INTO v_log FROM public.dose_logs
  WHERE id = p_log_id AND user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dose log not found';
  END IF;

  FOR v_med IN
    SELECT * FROM jsonb_array_elements(v_log.medicines_taken)
  LOOP
    IF (v_med->>'id') = p_medicine_id::text AND NOT v_found THEN
      v_found := true;
      UPDATE public.medicines
      SET remaining_count = remaining_count + 1, updated_at = now()
      WHERE id = p_medicine_id AND user_id = v_uid;
    ELSE
      v_remaining := v_remaining || jsonb_build_array(v_med);
    END IF;
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Medicine not found in this dose batch';
  END IF;
  IF jsonb_array_length(v_remaining) = 0 THEN
    DELETE FROM public.dose_logs WHERE id = v_log.id AND user_id = v_uid;
    RETURN jsonb_build_object('status', 'ok', 'deleted', 'batch');
  END IF;

  UPDATE public.dose_logs SET medicines_taken = v_remaining
  WHERE id = v_log.id AND user_id = v_uid;
  RETURN jsonb_build_object(
    'status', 'ok', 'deleted', 'medicine', 'remaining', v_remaining
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_dose_for_slot(
  p_dose_date date,
  p_scheduled_time time,
  p_taken_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_med record;
  v_deducted jsonb := '[]'::jsonb;
  v_low jsonb := '[]'::jsonb;
  v_new_count int;
  v_tz text;
  v_taken_at timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_dose_date IS NULL OR p_scheduled_time IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid', 'message', 'Date and scheduled time are required.'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_entries
    WHERE user_id = v_uid AND scheduled_time = p_scheduled_time
  ) THEN
    RETURN jsonb_build_object(
      'status', 'no_slot', 'message', 'That time is not on your schedule.'
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.dose_logs
    WHERE user_id = v_uid
      AND dose_date = p_dose_date
      AND scheduled_time = p_scheduled_time
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already_taken',
      'scheduled_time', p_scheduled_time::text,
      'dose_date', p_dose_date::text,
      'message', 'This dose was already logged for that day.'
    );
  END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'America/Chicago')
  INTO v_tz FROM public.profiles WHERE id = v_uid;
  v_tz := COALESCE(v_tz, 'America/Chicago');
  v_taken_at := COALESCE(
    p_taken_at, ((p_dose_date + p_scheduled_time) AT TIME ZONE v_tz)
  );

  FOR v_med IN
    SELECT m.id AS medicine_id, m.name, m.remaining_count, m.reorder_at
    FROM public.schedule_entries se
    JOIN public.medicines m ON m.id = se.medicine_id
    WHERE se.user_id = v_uid AND se.scheduled_time = p_scheduled_time
    ORDER BY se.sort_order, se.id
  LOOP
    UPDATE public.medicines
    SET remaining_count = GREATEST(0, remaining_count - 1), updated_at = now()
    WHERE id = v_med.medicine_id AND user_id = v_uid
    RETURNING remaining_count INTO v_new_count;
    v_deducted := v_deducted || jsonb_build_array(jsonb_build_object(
      'id', v_med.medicine_id,
      'name', v_med.name,
      'remaining_count', v_new_count
    ));
    IF v_new_count <= v_med.reorder_at THEN
      v_low := v_low || jsonb_build_array(jsonb_build_object(
        'id', v_med.medicine_id,
        'name', v_med.name,
        'remaining_count', v_new_count,
        'reorder_at', v_med.reorder_at
      ));
    END IF;
  END LOOP;

  INSERT INTO public.dose_logs (
    user_id, dose_date, scheduled_time, taken_at, medicines_taken, source
  )
  VALUES (
    v_uid, p_dose_date, p_scheduled_time, v_taken_at, v_deducted, 'manual'
  );
  RETURN jsonb_build_object(
    'status', 'ok',
    'scheduled_time', p_scheduled_time::text,
    'dose_date', p_dose_date::text,
    'deducted', v_deducted,
    'low_stock', v_low,
    'source', 'manual'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.take_current_dose_as_user(uuid, text, text)
  FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.take_current_dose(text, text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.take_dose_by_nfc_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_nfc_token(text) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.clear_nfc_token() FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.undo_dose_batch(uuid) FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.undo_dose_medicine(uuid, uuid)
  FROM PUBLIC, anonymous;
REVOKE ALL ON FUNCTION public.log_dose_for_slot(date, time, timestamptz)
  FROM PUBLIC, anonymous;

GRANT EXECUTE ON FUNCTION public.take_current_dose(text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_dose_by_nfc_token(text, text)
  TO authenticated, anonymous;
GRANT EXECUTE ON FUNCTION public.rotate_nfc_token(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_nfc_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_dose_batch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_dose_medicine(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_dose_for_slot(date, time, timestamptz)
  TO authenticated;
