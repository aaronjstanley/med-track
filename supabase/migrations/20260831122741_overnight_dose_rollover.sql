-- Match the most recently due schedule slot, including overnight rollover.
-- e.g. an 11pm dose taken at 12:05am logs against yesterday's 11pm instance.
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

  -- Most recent occurrence at or before now. Slots later than now today
  -- resolve to yesterday (so 11pm remains current until the next morning slot).
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

  INSERT INTO public.dose_logs (user_id, dose_date, scheduled_time, medicines_taken, source)
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
