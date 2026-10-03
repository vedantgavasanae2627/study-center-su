CREATE OR REPLACE FUNCTION course_to_code(p_course text) RETURNS int LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$ BEGIN RETURN CASE WHEN UPPER(p_course) IN ('BA') THEN 0 WHEN UPPER(p_course) IN ('BCOM') THEN 2 WHEN UPPER(p_course) IN ('MA') THEN 4 WHEN UPPER(p_course) IN ('MCOM') THEN 5 WHEN UPPER(p_course) IN ('MSC') THEN 6 WHEN UPPER(p_course) IN ('MBA') THEN 8 ELSE 0 END; END; $$;

CREATE OR REPLACE FUNCTION add_student(p_prn text, p_full_name text, p_enrollment_year int, p_course text, p_year_of_study int, p_college_name text, p_branch text, p_semester int, p_phone text, p_email text, p_center_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year_str text; v_prefix text; v_next_seq int; v_student_id text; v_new_id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) IS DISTINCT FROM p_center_id THEN RAISE EXCEPTION 'Not your center'; END IF;
  IF p_prn IS NULL OR length(p_prn) < 2 THEN RAISE EXCEPTION 'Invalid PRN'; END IF;
  IF p_full_name IS NULL OR length(p_full_name) < 1 THEN RAISE EXCEPTION 'Invalid name'; END IF;
  IF p_enrollment_year IS NULL OR p_enrollment_year < 2000 OR p_enrollment_year > 2100 THEN RAISE EXCEPTION 'Invalid enrollment year'; END IF;
  v_year_str := RIGHT(p_enrollment_year::text, 2);
  v_prefix := v_year_str || course_to_code(p_course)::text;
  SELECT COALESCE(MAX(CAST(SUBSTRING(student_id FROM 4) AS int)), 0) + 1 INTO v_next_seq FROM students WHERE student_id IS NOT NULL AND LEFT(student_id, 3) = v_prefix;
  v_student_id := v_prefix || LPAD(v_next_seq::text, 5, '0');
  INSERT INTO students (prn, full_name, college_name, branch, semester, center_id, student_id, enrollment_year, course, year_of_study, phone, email)
    VALUES (p_prn, p_full_name, COALESCE(p_college_name,''), COALESCE(p_branch,''), COALESCE(p_semester,1), p_center_id, v_student_id, p_enrollment_year, p_course, p_year_of_study, p_phone, p_email)
    RETURNING id INTO v_new_id;
  RETURN v_new_id;
END; $$;

CREATE OR REPLACE FUNCTION add_book_with_copies(p_title text, p_author text, p_sticker_ids text[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_book_id uuid; v_sticker text; v_count int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_title IS NULL OR length(p_title) < 1 THEN RAISE EXCEPTION 'Invalid title'; END IF;
  IF p_sticker_ids IS NULL OR array_length(p_sticker_ids, 1) IS NULL OR array_length(p_sticker_ids, 1) = 0 THEN RAISE EXCEPTION 'At least one sticker ID is required'; END IF;
  v_count := array_length(p_sticker_ids, 1);
  IF v_count > (SELECT COUNT(DISTINCT s) FROM unnest(p_sticker_ids) AS s) THEN RAISE EXCEPTION 'Duplicate sticker IDs in input'; END IF;
  INSERT INTO master_books (title, author, total_university_quantity) VALUES (p_title, COALESCE(p_author,''), v_count) RETURNING id INTO v_book_id;
  FOREACH v_sticker IN ARRAY p_sticker_ids LOOP
    INSERT INTO book_copies (book_id, sticker_id, status) VALUES (v_book_id, v_sticker, 'AVAILABLE');
  END LOOP;
  RETURN v_book_id;
END; $$;

CREATE OR REPLACE FUNCTION issue_book(p_student_id uuid, p_book_id uuid, p_center_id uuid, p_copy_id uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv center_inventory; v_tx_id uuid; v_copy book_copies;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) IS DISTINCT FROM p_center_id THEN RAISE EXCEPTION 'Not your center'; END IF;
  SELECT * INTO v_copy FROM book_copies WHERE id = p_copy_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book copy not found'; END IF;
  IF v_copy.book_id IS DISTINCT FROM p_book_id THEN RAISE EXCEPTION 'Copy does not match book'; END IF;
  IF v_copy.current_center_id IS DISTINCT FROM p_center_id THEN RAISE EXCEPTION 'Copy not at this center'; END IF;
  IF v_copy.status <> 'ALLOCATED_TO_CENTER' THEN RAISE EXCEPTION 'Copy not available for issue'; END IF;
  SELECT * INTO v_inv FROM center_inventory WHERE center_id = p_center_id AND book_id = p_book_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book not in center inventory'; END IF;
  IF v_inv.currently_available <= 0 THEN RAISE EXCEPTION 'No copies available'; END IF;
  UPDATE center_inventory SET currently_available = currently_available - 1, currently_borrowed = currently_borrowed + 1, last_issued_date = now() WHERE id = v_inv.id;
  UPDATE book_copies SET status = 'BORROWED', current_student_id = p_student_id WHERE id = p_copy_id;
  INSERT INTO student_transactions (student_id, book_id, center_id, copy_id, status, issue_date, due_date) VALUES (p_student_id, p_book_id, p_center_id, p_copy_id, 'ISSUED', now(), now() + interval '14 days') RETURNING id INTO v_tx_id;
  RETURN v_tx_id;
END; $$;

CREATE OR REPLACE FUNCTION return_book(p_transaction_id uuid) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx student_transactions; v_overdue_days int; v_fine numeric(10,2);
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_tx FROM student_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.status::text = 'RETURNED' THEN RAISE EXCEPTION 'Already returned'; END IF;
  IF has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) IS DISTINCT FROM v_tx.center_id THEN RAISE EXCEPTION 'Not your center'; END IF;
  v_overdue_days := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (now() - v_tx.due_date)) / 86400));
  v_fine := v_overdue_days * 5.0;
  UPDATE student_transactions SET status = 'RETURNED', return_date = now(), fine_amount = v_fine WHERE id = p_transaction_id;
  UPDATE center_inventory SET currently_available = currently_available + 1, currently_borrowed = GREATEST(0, currently_borrowed - 1) WHERE center_id = v_tx.center_id AND book_id = v_tx.book_id;
  IF v_tx.copy_id IS NOT NULL THEN UPDATE book_copies SET status = 'ALLOCATED_TO_CENTER', current_student_id = NULL WHERE id = v_tx.copy_id; END IF;
  RETURN v_fine;
END; $$;

CREATE OR REPLACE FUNCTION renew_book(p_transaction_id uuid) RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx student_transactions; v_new_due timestamptz; v_sid uuid;
BEGIN
  v_sid := my_student_id(auth.uid());
  IF v_sid IS NULL THEN RAISE EXCEPTION 'Not authenticated as student'; END IF;
  SELECT * INTO v_tx FROM student_transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF v_tx.student_id IS DISTINCT FROM v_sid THEN RAISE EXCEPTION 'Not your transaction'; END IF;
  IF v_tx.status::text = 'RETURNED' THEN RAISE EXCEPTION 'Already returned'; END IF;
  IF v_tx.due_date < now() THEN RAISE EXCEPTION 'Cannot renew overdue book'; END IF;
  v_new_due := now() + interval '7 days';
  UPDATE student_transactions SET status = 'RENEWED', due_date = v_new_due WHERE id = p_transaction_id;
  RETURN v_new_due;
END; $$;

CREATE OR REPLACE FUNCTION restock_with_stickers(p_book_id uuid, p_to_center_id uuid, p_sticker_ids text[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tr_id uuid; v_sticker text; v_count int; v_copy book_copies;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_sticker_ids IS NULL OR array_length(p_sticker_ids, 1) IS NULL THEN RAISE EXCEPTION 'No sticker IDs provided'; END IF;
  v_count := array_length(p_sticker_ids, 1);
  FOREACH v_sticker IN ARRAY p_sticker_ids LOOP
    SELECT * INTO v_copy FROM book_copies WHERE book_id = p_book_id AND sticker_id = v_sticker;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sticker % not found for this book', v_sticker; END IF;
    IF v_copy.status NOT IN ('AVAILABLE') THEN RAISE EXCEPTION 'Sticker % is not available (status: %)', v_sticker, v_copy.status; END IF;
    IF v_copy.current_center_id IS NOT NULL THEN RAISE EXCEPTION 'Sticker % is already allocated to a center', v_sticker; END IF;
  END LOOP;
  INSERT INTO inventory_transfers (book_id, from_center_id, to_center_id, quantity, transfer_type, status, copy_ids) VALUES (p_book_id, NULL, p_to_center_id, v_count, 'RESTOCK', 'DISPATCHED', p_sticker_ids) RETURNING id INTO v_tr_id;
  FOREACH v_sticker IN ARRAY p_sticker_ids LOOP
    UPDATE book_copies SET status = 'ALLOCATED_TO_CENTER', current_center_id = p_to_center_id, transfer_id = v_tr_id WHERE book_id = p_book_id AND sticker_id = v_sticker;
  END LOOP;
  INSERT INTO center_inventory (center_id, book_id, total_allocated, currently_available, currently_borrowed) VALUES (p_to_center_id, p_book_id, v_count, v_count, 0)
    ON CONFLICT (center_id, book_id) DO UPDATE SET total_allocated = center_inventory.total_allocated + v_count, currently_available = center_inventory.currently_available + v_count, updated_at = now();
  RETURN v_tr_id;
END; $$;

CREATE OR REPLACE FUNCTION create_relocation(p_book_id uuid, p_from_center_id uuid, p_to_center_id uuid, p_sticker_ids text[]) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv center_inventory; v_tr_id uuid; v_sticker text; v_count int; v_copy book_copies;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_from_center_id = p_to_center_id THEN RAISE EXCEPTION 'Same center'; END IF;
  IF p_sticker_ids IS NULL OR array_length(p_sticker_ids, 1) IS NULL THEN RAISE EXCEPTION 'No sticker IDs provided'; END IF;
  v_count := array_length(p_sticker_ids, 1);
  FOREACH v_sticker IN ARRAY p_sticker_ids LOOP
    SELECT * INTO v_copy FROM book_copies WHERE book_id = p_book_id AND sticker_id = v_sticker FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sticker % not found', v_sticker; END IF;
    IF v_copy.current_center_id IS DISTINCT FROM p_from_center_id THEN RAISE EXCEPTION 'Sticker % is not at the source center', v_sticker; END IF;
    IF v_copy.status <> 'ALLOCATED_TO_CENTER' THEN RAISE EXCEPTION 'Sticker % is not available (status: %)', v_sticker, v_copy.status; END IF;
  END LOOP;
  SELECT * INTO v_inv FROM center_inventory WHERE center_id = p_from_center_id AND book_id = p_book_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Book not in origin inventory'; END IF;
  IF v_inv.currently_available < v_count THEN RAISE EXCEPTION 'Not enough available copies'; END IF;
  UPDATE center_inventory SET currently_available = currently_available - v_count, total_allocated = GREATEST(0, total_allocated - v_count) WHERE id = v_inv.id;
  INSERT INTO inventory_transfers (book_id, from_center_id, to_center_id, quantity, transfer_type, status, copy_ids) VALUES (p_book_id, p_from_center_id, p_to_center_id, v_count, 'IDLE_RELOCATION', 'DISPATCHED', p_sticker_ids) RETURNING id INTO v_tr_id;
  FOREACH v_sticker IN ARRAY p_sticker_ids LOOP
    UPDATE book_copies SET status = 'IN_TRANSIT', current_center_id = NULL, transfer_id = v_tr_id WHERE book_id = p_book_id AND sticker_id = v_sticker;
  END LOOP;
  RETURN v_tr_id;
END; $$;

CREATE OR REPLACE FUNCTION accept_transfer(p_transfer_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tr inventory_transfers; v_inv center_inventory; v_sticker text;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_tr FROM inventory_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_tr.status::text <> 'PENDING' AND v_tr.status::text <> 'DISPATCHED' THEN RAISE EXCEPTION 'Transfer already processed'; END IF;
  IF has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) IS DISTINCT FROM v_tr.to_center_id THEN RAISE EXCEPTION 'Not your center'; END IF;
  IF v_tr.quantity <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  UPDATE inventory_transfers SET status = 'RECEIVED' WHERE id = p_transfer_id;
  IF v_tr.copy_ids IS NOT NULL THEN
    FOREACH v_sticker IN ARRAY v_tr.copy_ids LOOP
      UPDATE book_copies SET status = 'ALLOCATED_TO_CENTER', current_center_id = v_tr.to_center_id, transfer_id = NULL WHERE book_id = v_tr.book_id AND sticker_id = v_sticker;
    END LOOP;
  END IF;
  SELECT * INTO v_inv FROM center_inventory WHERE center_id = v_tr.to_center_id AND book_id = v_tr.book_id FOR UPDATE;
  IF FOUND THEN
    UPDATE center_inventory SET total_allocated = total_allocated + v_tr.quantity, currently_available = currently_available + v_tr.quantity WHERE id = v_inv.id;
  ELSE
    INSERT INTO center_inventory (center_id, book_id, total_allocated, currently_available, currently_borrowed) VALUES (v_tr.to_center_id, v_tr.book_id, v_tr.quantity, v_tr.quantity, 0);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION create_book_request(p_book_id uuid, p_quantity int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_center uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_center := my_center_id(auth.uid());
  IF v_center IS NULL THEN RAISE EXCEPTION 'No center assigned'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  INSERT INTO book_requests (center_id, book_id, quantity_needed) VALUES (v_center, p_book_id, p_quantity) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION respond_to_book_request(p_request_id uuid, p_status text, p_remarks text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_status NOT IN ('ACCEPTED','REJECTED') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE book_requests SET status = p_status::book_request_status, admin_remarks = COALESCE(p_remarks,'') WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION delete_all_book_requests() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int; v_center uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_center := my_center_id(auth.uid());
  IF v_center IS NULL THEN RAISE EXCEPTION 'No center assigned'; END IF;
  DELETE FROM book_requests WHERE center_id = v_center;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION add_donation_to_catalog(p_donation_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_donation book_donations; v_book_id uuid; v_copy_id uuid;
BEGIN
  IF NOT is_staff(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO v_donation FROM book_donations WHERE id = p_donation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Donation not found'; END IF;
  IF v_donation.status = 'ADDED_TO_CATALOG' THEN RAISE EXCEPTION 'Already added'; END IF;
  IF has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) IS DISTINCT FROM v_donation.center_id THEN RAISE EXCEPTION 'Not your center'; END IF;
  SELECT id INTO v_book_id FROM master_books WHERE LOWER(title) = LOWER(v_donation.book_name) AND LOWER(COALESCE(author,'')) = LOWER(COALESCE(v_donation.author,'')) LIMIT 1;
  IF v_book_id IS NULL THEN
    INSERT INTO master_books (title, author, total_university_quantity) VALUES (v_donation.book_name, v_donation.author, 0) RETURNING id INTO v_book_id;
  END IF;
  INSERT INTO book_copies (book_id, sticker_id, current_center_id, status) VALUES (v_book_id, v_donation.sticker_id, v_donation.center_id, 'ALLOCATED_TO_CENTER') RETURNING id INTO v_copy_id;
  INSERT INTO center_inventory (center_id, book_id, total_allocated, currently_available, currently_borrowed) VALUES (v_donation.center_id, v_book_id, 1, 1, 0)
    ON CONFLICT (center_id, book_id) DO UPDATE SET total_allocated = center_inventory.total_allocated + 1, currently_available = center_inventory.currently_available + 1, updated_at = now();
  UPDATE master_books SET total_university_quantity = total_university_quantity + 1 WHERE id = v_book_id;
  UPDATE book_donations SET status = 'ADDED_TO_CATALOG' WHERE id = p_donation_id;
END; $$;

REVOKE EXECUTE ON FUNCTION add_student FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION add_book_with_copies FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION issue_book FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION return_book FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION renew_book FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION restock_with_stickers FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_relocation FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION accept_transfer FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_book_request FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION respond_to_book_request FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION delete_all_book_requests FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION add_donation_to_catalog FROM PUBLIC, anon;