CREATE OR REPLACE FUNCTION public.accept_book_request_with_stickers(p_request_id uuid, p_sticker_ids text[], p_remarks text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req book_requests; v_tr uuid; v_n int; v_ok int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_n := COALESCE(array_length(p_sticker_ids,1),0);
  IF v_n < 1 THEN RAISE EXCEPTION 'Select at least one copy'; END IF;
  SELECT * INTO v_req FROM book_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'SENT' THEN RAISE EXCEPTION 'Request already answered'; END IF;
  SELECT count(*) INTO v_ok FROM book_copies WHERE book_id = v_req.book_id AND sticker_id = ANY(p_sticker_ids) AND status = 'AVAILABLE' AND current_center_id IS NULL;
  IF v_ok <> v_n THEN RAISE EXCEPTION 'Some selected copies are no longer available'; END IF;
  INSERT INTO inventory_transfers (book_id, from_center_id, to_center_id, quantity, transfer_type, status, copy_ids)
    VALUES (v_req.book_id, NULL, v_req.center_id, v_n, 'RESTOCK', 'RECEIVED', p_sticker_ids) RETURNING id INTO v_tr;
  UPDATE book_copies SET status='ALLOCATED_TO_CENTER', current_center_id=v_req.center_id, transfer_id=v_tr WHERE book_id = v_req.book_id AND sticker_id = ANY(p_sticker_ids);
  INSERT INTO center_inventory (center_id, book_id, total_allocated, currently_available, currently_borrowed)
    VALUES (v_req.center_id, v_req.book_id, v_n, v_n, 0)
    ON CONFLICT (center_id, book_id) DO UPDATE SET total_allocated = center_inventory.total_allocated + v_n,
      currently_available = center_inventory.currently_available + v_n, updated_at = now();
  UPDATE book_requests SET status='ACCEPTED', admin_remarks = COALESCE(NULLIF(p_remarks,''), 'Sent ' || v_n || ' copies') WHERE id = p_request_id;
  RETURN v_n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.accept_book_request_with_stickers(uuid,text[],text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_book_request_with_stickers(uuid,text[],text) TO authenticated;