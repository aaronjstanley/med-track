-- Allow users to update/delete their own dose logs (for undo)
CREATE POLICY "dose_logs_update_own" ON public.dose_logs
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "dose_logs_delete_own" ON public.dose_logs
  FOR DELETE USING (user_id = auth.uid());

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

  SELECT * INTO v_log
  FROM public.dose_logs
  WHERE id = p_log_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dose log not found';
  END IF;

  FOR v_med IN SELECT * FROM jsonb_array_elements(COALESCE(v_log.medicines_taken, '[]'::jsonb))
  LOOP
    BEGIN
      v_med_id := (v_med->>'id')::uuid;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;

    UPDATE public.medicines
    SET remaining_count = remaining_count + 1,
        updated_at = now()
    WHERE id = v_med_id AND user_id = v_uid;
  END LOOP;

  DELETE FROM public.dose_logs WHERE id = v_log.id AND user_id = v_uid;

  RETURN jsonb_build_object('status', 'ok', 'deleted', 'batch');
END;
$$;

CREATE OR REPLACE FUNCTION public.undo_dose_medicine(p_log_id uuid, p_medicine_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_log public.dose_logs%ROWTYPE;
  v_remaining jsonb;
  v_found boolean := false;
  v_med jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_log
  FROM public.dose_logs
  WHERE id = p_log_id AND user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dose log not found';
  END IF;

  v_remaining := '[]'::jsonb;

  FOR v_med IN SELECT * FROM jsonb_array_elements(COALESCE(v_log.medicines_taken, '[]'::jsonb))
  LOOP
    IF (v_med->>'id') = p_medicine_id::text THEN
      IF NOT v_found THEN
        v_found := true;
        UPDATE public.medicines
        SET remaining_count = remaining_count + 1,
            updated_at = now()
        WHERE id = p_medicine_id AND user_id = v_uid;
      ELSE
        v_remaining := v_remaining || jsonb_build_array(v_med);
      END IF;
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

  UPDATE public.dose_logs
  SET medicines_taken = v_remaining
  WHERE id = v_log.id AND user_id = v_uid;

  RETURN jsonb_build_object('status', 'ok', 'deleted', 'medicine', 'remaining', v_remaining);
END;
$$;

REVOKE ALL ON FUNCTION public.undo_dose_batch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_dose_batch(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_dose_batch(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.undo_dose_medicine(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_dose_medicine(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.undo_dose_medicine(uuid, uuid) TO authenticated;
