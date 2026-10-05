CREATE POLICY ci_select_student ON public.center_inventory FOR SELECT TO authenticated
USING (center_id = (SELECT s.center_id FROM public.students s WHERE s.user_id = auth.uid() LIMIT 1));

CREATE OR REPLACE FUNCTION public.accept_book_request(p_request_id uuid, p_quantity int, p_remarks text) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req book_requests; v_ids uuid[]; v_stickers text[]; v_tr uuid; v_n int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  SELECT * INTO v_req FROM book_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status <> 'SENT' THEN RAISE EXCEPTION 'Request already answered'; END IF;
  SELECT array_agg(id), array_agg(sticker_id) INTO v_ids, v_stickers FROM (
    SELECT id, sticker_id FROM book_copies WHERE book_id = v_req.book_id AND status = 'AVAILABLE' AND current_center_id IS NULL
    ORDER BY sticker_id LIMIT p_quantity FOR UPDATE) c;
  v_n := COALESCE(array_length(v_ids,1),0);
  IF v_n < p_quantity THEN RAISE EXCEPTION 'Only % copies available at the university', v_n; END IF;
  INSERT INTO inventory_transfers (book_id, from_center_id, to_center_id, quantity, transfer_type, status, copy_ids)
    VALUES (v_req.book_id, NULL, v_req.center_id, v_n, 'RESTOCK', 'RECEIVED', v_stickers) RETURNING id INTO v_tr;
  UPDATE book_copies SET status='ALLOCATED_TO_CENTER', current_center_id=v_req.center_id, transfer_id=v_tr WHERE id = ANY(v_ids);
  INSERT INTO center_inventory (center_id, book_id, total_allocated, currently_available, currently_borrowed)
    VALUES (v_req.center_id, v_req.book_id, v_n, v_n, 0)
    ON CONFLICT (center_id, book_id) DO UPDATE SET total_allocated = center_inventory.total_allocated + v_n,
      currently_available = center_inventory.currently_available + v_n, updated_at = now();
  UPDATE book_requests SET status='ACCEPTED', admin_remarks = COALESCE(NULLIF(p_remarks,''), 'Sent ' || v_n || ' copies') WHERE id = p_request_id;
  RETURN v_n;
END; $$;
GRANT EXECUTE ON FUNCTION public.accept_book_request(uuid,int,text) TO authenticated;