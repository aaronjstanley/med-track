-- Allow manual (retroactive) dose logging for forgotten batches
ALTER TABLE public.dose_logs DROP CONSTRAINT IF EXISTS dose_logs_source_check;
ALTER TABLE public.dose_logs
  ADD CONSTRAINT dose_logs_source_check CHECK (source IN ('button', 'nfc', 'manual'));

CREATE OR REPLACE FUNCTION public.log_dose_for_slot_as_user(
  p_user_id uuid,
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
  v_med record;
  v_deducted jsonb := '[]'::jsonb;
  v_low jsonb := '[]'::jsonb;
  v_new_count int;
  v_tz text;
  v_taken_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_dose_date IS NULL OR p_scheduled_time IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'message', 'Date and scheduled time are required.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_entries se
    WHERE se.user_id = p_user_id AND se.scheduled_time = p_scheduled_time
  ) THEN
    RETURN jsonb_build_object(
      'status', 'no_slot',
      'message', 'That time is not on your schedule.'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.dose_logs
    WHERE user_id = p_user_id
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
    INTO v_tz
  FROM public.profiles
  WHERE id = p_user_id;

  v_tz := COALESCE(v_tz, 'America/Chicago');
  v_taken_at := COALESCE(
    p_taken_at,
    ((p_dose_date + p_scheduled_time) AT TIME ZONE v_tz)
  );

  FOR v_med IN
    SELECT m.id AS medicine_id, m.name, m.remaining_count, m.reorder_at
    FROM public.schedule_entries se
    JOIN public.medicines m ON m.id = se.medicine_id
    WHERE se.user_id = p_user_id AND se.scheduled_time = p_scheduled_time
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
    user_id, dose_date, scheduled_time, taken_at, medicines_taken, source
  )
  VALUES (
    p_user_id, p_dose_date, p_scheduled_time, v_taken_at, v_deducted, 'manual'
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

REVOKE ALL ON FUNCTION public.log_dose_for_slot_as_user(uuid, date, time, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_dose_for_slot_as_user(uuid, date, time, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.log_dose_for_slot_as_user(uuid, date, time, timestamptz) FROM authenticated;

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN public.log_dose_for_slot_as_user(
    auth.uid(), p_dose_date, p_scheduled_time, p_taken_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_dose_for_slot(date, time, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_dose_for_slot(date, time, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_dose_for_slot(date, time, timestamptz) TO authenticated;
