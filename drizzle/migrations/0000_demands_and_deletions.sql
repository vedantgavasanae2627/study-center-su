CREATE TABLE public.book_demands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.study_centers(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.master_books(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, book_id)
);
GRANT SELECT ON public.book_demands TO authenticated;
GRANT ALL ON public.book_demands TO service_role;
ALTER TABLE public.book_demands ENABLE ROW LEVEL SECURITY;
CREATE POLICY bdm_select ON public.book_demands FOR SELECT TO authenticated USING (
  is_admin(auth.uid())
  OR (has_role(auth.uid(),'STUDY_CENTER') AND center_id = my_center_id(auth.uid()))
  OR student_id = my_student_id(auth.uid())
);

CREATE OR REPLACE FUNCTION public.request_book_demand(p_book_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sid uuid; v_cid uuid; v_id uuid; v_have int;
BEGIN
  SELECT id, center_id INTO v_sid, v_cid FROM students WHERE user_id = auth.uid();
  IF v_sid IS NULL THEN RAISE EXCEPTION 'Only students can request books'; END IF;
  SELECT count(*) INTO v_have FROM book_copies WHERE book_id = p_book_id AND current_center_id = v_cid;
  IF v_have > 0 THEN RAISE EXCEPTION 'This book is already at your study center'; END IF;
  INSERT INTO book_demands(student_id, center_id, book_id) VALUES (v_sid, v_cid, p_book_id)
  ON CONFLICT (student_id, book_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'You already requested this book'; END IF;
  RETURN v_id;
END $$;

-- Delete a student: return their issued books to the center's shelf
CREATE OR REPLACE FUNCTION public.delete_student(p_student_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid; v_uid uuid; r record;
BEGIN
  SELECT center_id, user_id INTO v_cid, v_uid FROM students WHERE id = p_student_id;
  IF v_cid IS NULL THEN RAISE EXCEPTION 'Student not found'; END IF;
  IF NOT (is_admin(auth.uid()) OR (has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) = v_cid)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  FOR r IN SELECT * FROM student_transactions WHERE student_id = p_student_id AND status <> 'RETURNED' LOOP
    UPDATE book_copies SET status = 'ALLOCATED_TO_CENTER', current_student_id = NULL, current_center_id = r.center_id, updated_at = now()
      WHERE id = r.copy_id;
    UPDATE center_inventory SET currently_available = currently_available + 1,
      currently_borrowed = GREATEST(currently_borrowed - 1, 0), updated_at = now()
      WHERE center_id = r.center_id AND book_id = r.book_id;
  END LOOP;
  UPDATE book_copies SET current_student_id = NULL WHERE current_student_id = p_student_id;
  DELETE FROM student_transactions WHERE student_id = p_student_id;
  UPDATE book_donations SET student_id = NULL WHERE student_id = p_student_id;
  DELETE FROM book_demands WHERE student_id = p_student_id;
  DELETE FROM students WHERE id = p_student_id;
  RETURN v_uid;
END $$;

-- Delete a center: every copy goes back to the university
CREATE OR REPLACE FUNCTION public.delete_center(p_center_id uuid) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uids uuid[]; v_n int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only admins can delete centers'; END IF;
  SELECT coalesce(array_agg(u), '{}') INTO v_uids FROM (
    SELECT user_id u FROM students WHERE center_id = p_center_id AND user_id IS NOT NULL
    UNION SELECT id FROM app_users WHERE center_id = p_center_id) x;
  UPDATE book_copies SET transfer_id = NULL WHERE transfer_id IN
    (SELECT id FROM inventory_transfers WHERE to_center_id = p_center_id OR from_center_id = p_center_id);
  WITH moved AS (
    UPDATE book_copies SET status = 'AVAILABLE', current_center_id = NULL, current_student_id = NULL, updated_at = now()
    WHERE current_center_id = p_center_id
       OR current_student_id IN (SELECT id FROM students WHERE center_id = p_center_id)
       OR (status = 'IN_TRANSIT' AND id IN (SELECT unnest(copy_ids) FROM inventory_transfers
            WHERE to_center_id = p_center_id OR from_center_id = p_center_id))
    RETURNING 1) SELECT count(*) INTO v_n FROM moved;
  DELETE FROM student_transactions WHERE center_id = p_center_id
    OR student_id IN (SELECT id FROM students WHERE center_id = p_center_id);
  DELETE FROM inventory_transfers WHERE to_center_id = p_center_id OR from_center_id = p_center_id;
  UPDATE inventory_transfers SET request_id = NULL WHERE request_id IN (SELECT id FROM book_requests WHERE center_id = p_center_id);
  DELETE FROM book_requests WHERE center_id = p_center_id;
  DELETE FROM book_donations WHERE center_id = p_center_id;
  DELETE FROM book_demands WHERE center_id = p_center_id;
  DELETE FROM center_inventory WHERE center_id = p_center_id;
  DELETE FROM students WHERE center_id = p_center_id;
  DELETE FROM app_users WHERE center_id = p_center_id;
  DELETE FROM study_centers WHERE id = p_center_id;
  RETURN v_uids;
END $$;

-- Delete chosen copies of a book; only copies sitting at the university
CREATE OR REPLACE FUNCTION public.delete_book_copies(p_book_id uuid, p_sticker_ids text[]) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int; v_bad int; v_left int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Only admins can delete books'; END IF;
  SELECT count(*) INTO v_bad FROM book_copies WHERE book_id = p_book_id AND sticker_id = ANY(p_sticker_ids)
    AND NOT (status = 'AVAILABLE' AND current_center_id IS NULL);
  IF v_bad > 0 THEN RAISE EXCEPTION 'Only copies at the university can be deleted'; END IF;
  UPDATE student_transactions SET copy_id = NULL WHERE copy_id IN
    (SELECT id FROM book_copies WHERE book_id = p_book_id AND sticker_id = ANY(p_sticker_ids));
  DELETE FROM book_copies WHERE book_id = p_book_id AND sticker_id = ANY(p_sticker_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  UPDATE master_books SET total_university_quantity = GREATEST(total_university_quantity - v_n, 0), updated_at = now() WHERE id = p_book_id;
  SELECT count(*) INTO v_left FROM book_copies WHERE book_id = p_book_id;
  IF v_left = 0 AND NOT EXISTS (SELECT 1 FROM student_transactions WHERE book_id = p_book_id)
     AND NOT EXISTS (SELECT 1 FROM inventory_transfers WHERE book_id = p_book_id) THEN
    DELETE FROM book_requests WHERE book_id = p_book_id;
    DELETE FROM center_inventory WHERE book_id = p_book_id;
    DELETE FROM book_demands WHERE book_id = p_book_id;
    DELETE FROM master_books WHERE id = p_book_id;
  END IF;
  RETURN v_n;
END $$;

REVOKE EXECUTE ON FUNCTION public.request_book_demand(uuid), public.delete_student(uuid), public.delete_center(uuid), public.delete_book_copies(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_book_demand(uuid), public.delete_student(uuid), public.delete_center(uuid), public.delete_book_copies(uuid,text[]) TO authenticated;