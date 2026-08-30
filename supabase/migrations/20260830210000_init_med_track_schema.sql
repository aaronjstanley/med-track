-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Medicines
CREATE TABLE public.medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  remaining_count integer NOT NULL DEFAULT 0 CHECK (remaining_count >= 0),
  reorder_at integer NOT NULL DEFAULT 5 CHECK (reorder_at >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX medicines_user_id_idx ON public.medicines(user_id);

-- Schedule entries
CREATE TABLE public.schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  scheduled_time time NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX schedule_entries_user_id_idx ON public.schedule_entries(user_id);
CREATE INDEX schedule_entries_user_time_idx ON public.schedule_entries(user_id, scheduled_time);

-- Dose logs (prevent double deduct)
CREATE TABLE public.dose_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dose_date date NOT NULL,
  scheduled_time time NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dose_date, scheduled_time)
);

CREATE INDEX dose_logs_user_date_idx ON public.dose_logs(user_id, dose_date);

-- Push subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dose_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "medicines_select_own" ON public.medicines FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "medicines_insert_own" ON public.medicines FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "medicines_update_own" ON public.medicines FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "medicines_delete_own" ON public.medicines FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "schedule_select_own" ON public.schedule_entries FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "schedule_insert_own" ON public.schedule_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "schedule_update_own" ON public.schedule_entries FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "schedule_delete_own" ON public.schedule_entries FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "dose_logs_select_own" ON public.dose_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "dose_logs_insert_own" ON public.dose_logs FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "push_select_own" ON public.push_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "push_insert_own" ON public.push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_update_own" ON public.push_subscriptions FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_delete_own" ON public.push_subscriptions FOR DELETE USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.take_current_dose(p_timezone text DEFAULT 'America/Chicago')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now_time time;
  v_today date;
  v_slot time;
  v_med record;
  v_deducted jsonb := '[]'::jsonb;
  v_low jsonb := '[]'::jsonb;
  v_new_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_timezone IS NOT NULL AND length(trim(p_timezone)) > 0 THEN
    INSERT INTO public.profiles (id, timezone)
    VALUES (v_uid, p_timezone)
    ON CONFLICT (id) DO UPDATE
      SET timezone = EXCLUDED.timezone, updated_at = now();
  ELSE
    SELECT timezone INTO p_timezone FROM public.profiles WHERE id = v_uid;
    p_timezone := COALESCE(p_timezone, 'America/Chicago');
  END IF;

  v_now_time := (timezone(p_timezone, now()))::time;
  v_today := (timezone(p_timezone, now()))::date;

  SELECT se.scheduled_time INTO v_slot
  FROM public.schedule_entries se
  WHERE se.user_id = v_uid
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
    WHERE user_id = v_uid AND dose_date = v_today AND scheduled_time = v_slot
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
    WHERE se.user_id = v_uid AND se.scheduled_time = v_slot
    ORDER BY se.sort_order, se.id
  LOOP
    UPDATE public.medicines
    SET remaining_count = GREATEST(0, remaining_count - 1),
        updated_at = now()
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

  INSERT INTO public.dose_logs (user_id, dose_date, scheduled_time)
  VALUES (v_uid, v_today, v_slot);

  RETURN jsonb_build_object(
    'status', 'ok',
    'scheduled_time', v_slot::text,
    'dose_date', v_today::text,
    'deducted', v_deducted,
    'low_stock', v_low
  );
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE ALL ON FUNCTION public.take_current_dose(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_current_dose(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.take_current_dose(text) TO authenticated;
