ALTER TABLE public.dose_logs
  ADD COLUMN IF NOT EXISTS medicines_taken jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'button'
    CHECK (source IN ('button', 'nfc'));

CREATE OR REPLACE FUNCTION public.take_current_dose(
  p_timezone text DEFAULT 'America/Chicago',
  p_source text DEFAULT 'button'
)
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
  v_source text := CASE
    WHEN lower(coalesce(p_source, 'button')) = 'nfc' THEN 'nfc'
    ELSE 'button'
  END;
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

  INSERT INTO public.dose_logs (user_id, dose_date, scheduled_time, medicines_taken, source)
  VALUES (v_uid, v_today, v_slot, v_deducted, v_source);

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

REVOKE ALL ON FUNCTION public.take_current_dose(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_current_dose(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.take_current_dose(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.take_current_dose(p_timezone text DEFAULT 'America/Chicago')
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.take_current_dose(p_timezone, 'button');
$$;

REVOKE ALL ON FUNCTION public.take_current_dose(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.take_current_dose(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.take_current_dose(text) TO authenticated;
