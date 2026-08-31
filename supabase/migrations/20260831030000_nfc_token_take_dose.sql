-- NFC personal take token (hashed) + token-based dose recording
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nfc_token_hash text UNIQUE;

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
  v_slot time;
  v_med record;
  v_deducted jsonb := '[]'::jsonb;
  v_low jsonb := '[]'::jsonb;
  v_new_count int;
  v_source text := CASE
    WHEN lower(coalesce(p_source, 'button')) = 'nfc' THEN 'nfc'
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

  SELECT se.scheduled_time INTO v_slot
  FROM public.schedule_entries se
  WHERE se.user_id = p_user_id
    AND se.scheduled_time <= v_now_time
  ORDER BY se.scheduled_time DESC
  LIMIT 1;

  IF v_slot IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'no_slot',
      'message', 'No scheduled dose for this time of day yet.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dose_logs
    WHERE user_id = p_user_id AND dose_date = v_today AND scheduled_time = v_slot
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already_taken',
      'scheduled_time', v_slot::text,
      'message', 'This dose was already taken today.'
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

  INSERT INTO public.dose_logs (user_id, dose_date, scheduled_time, medicines_taken, source)
  VALUES (p_user_id, v_today, v_slot, v_deducted, v_source);

  RETURN jsonb_build_object(
    'status', 'ok',
    'scheduled_time', v_slot::text,
    'dose_date', v_today::text,
    'deducted', v_deducted,
    'low_stock', v_low,
    'source', v_source
  );
END;
$$;

REVOKE ALL ON FUNCTION public.take_current_dose_as_user(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_current_dose_as_user(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.take_current_dose_as_user(uuid, text, text) FROM authenticated;

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

CREATE OR REPLACE FUNCTION public.take_current_dose(p_timezone text DEFAULT 'America/Chicago')
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.take_current_dose(p_timezone, 'button');
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
    SET nfc_token_hash = EXCLUDED.nfc_token_hash,
        updated_at = now();

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

REVOKE ALL ON FUNCTION public.take_current_dose(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_current_dose(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.take_current_dose(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.take_current_dose(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_current_dose(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.take_current_dose(text) TO authenticated;

REVOKE ALL ON FUNCTION public.take_dose_by_nfc_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.take_dose_by_nfc_token(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.take_dose_by_nfc_token(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rotate_nfc_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_nfc_token(text) TO authenticated;

REVOKE ALL ON FUNCTION public.clear_nfc_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_nfc_token() TO authenticated;
