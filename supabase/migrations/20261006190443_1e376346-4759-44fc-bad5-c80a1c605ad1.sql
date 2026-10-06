ALTER TABLE public.inventory_transfers ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES public.book_requests(id) ON DELETE SET NULL;

-- Admin accepts request: copies go IN_TRANSIT, center must mark received
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
  INSERT INTO inventory_transfers (book_id, from_center_id, to_center_id, quantity, transfer_type, status, copy_ids, request_id)
    VALUES (v_req.book_id, NULL, v_req.center_id, v_n, 'RESTOCK', 'DISPATCHED', p_sticker_ids, p_request_id) RETURNING id INTO v_tr;
  UPDATE book_copies SET status='IN_TRANSIT', current_center_id=NULL, transfer_id=v_tr WHERE book_id = v_req.book_id AND sticker_id = ANY(p_sticker_ids);
  UPDATE book_requests SET status='ACCEPTED', admin_remarks = COALESCE(NULLIF(p_remarks,''), 'Dispatched ' || v_n || ' copies') WHERE id = p_request_id;
  RETURN v_n;
END; $$;

-- Restock: dispatched, counted only when center marks received
CREATE OR REPLACE FUNCTION public.restock_with_stickers(p_book_id uuid, p_to_center_id uuid, p_sticker_ids text[]) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tr uuid; v_n int; v_ok int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_n := COALESCE(array_length(p_sticker_ids,1),0);
  IF v_n < 1 THEN RAISE EXCEPTION 'No sticker IDs provided'; END IF;
  SELECT count(*) INTO v_ok FROM book_copies WHERE book_id = p_book_id AND sticker_id = ANY(p_sticker_ids) AND status = 'AVAILABLE' AND current_center_id IS NULL;
  IF v_ok <> v_n THEN RAISE EXCEPTION 'Some selected copies are not available at the university'; END IF;
  INSERT INTO inventory_transfers (book_id, from_center_id, to_center_id, quantity, transfer_type, status, copy_ids)
    VALUES (p_book_id, NULL, p_to_center_id, v_n, 'RESTOCK', 'DISPATCHED', p_sticker_ids) RETURNING id INTO v_tr;
  UPDATE book_copies SET status='IN_TRANSIT', current_center_id=NULL, transfer_id=v_tr WHERE book_id = p_book_id AND sticker_id = ANY(p_sticker_ids);
  RETURN v_tr;
END; $$;

-- Relocation: admin only sets book, centers and quantity; status PENDING
DROP FUNCTION IF EXISTS public.create_relocation(uuid, uuid, uuid, text[]);
CREATE OR REPLACE FUNCTION public.create_relocation(p_book_id uuid, p_from_center_id uuid, p_to_center_id uuid, p_quantity int) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tr uuid; v_free int;
BEGIN
  IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF p_from_center_id = p_to_center_id THEN RAISE EXCEPTION 'Same center'; END IF;
  IF COALESCE(p_quantity,0) < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  SELECT count(*) INTO v_free FROM book_copies WHERE book_id = p_book_id AND current_center_id = p_from_center_id AND status = 'ALLOCATED_TO_CENTER';
  IF v_free < p_quantity THEN RAISE EXCEPTION 'Source center has only % free copies', v_free; END IF;
  INSERT INTO inventory_transfers (book_id, from_center_id, to_center_id, quantity, transfer_type, status)
    VALUES (p_book_id, p_from_center_id, p_to_center_id, p_quantity, 'IDLE_RELOCATION', 'PENDING') RETURNING id INTO v_tr;
  RETURN v_tr;
END; $$;

-- Source center dispatches, choosing exactly the requested sticker IDs
CREATE OR REPLACE FUNCTION public.dispatch_transfer(p_transfer_id uuid, p_sticker_ids text[]) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t inventory_transfers; v_n int; v_ok int;
BEGIN
  SELECT * INTO v_t FROM inventory_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_t.transfer_type <> 'IDLE_RELOCATION' OR v_t.status <> 'PENDING' THEN RAISE EXCEPTION 'Transfer is not waiting for dispatch'; END IF;
  IF NOT (is_admin(auth.uid()) OR (has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) = v_t.from_center_id)) THEN RAISE EXCEPTION 'Only the sending center can dispatch'; END IF;
  v_n := COALESCE(array_length(p_sticker_ids,1),0);
  IF v_n <> v_t.quantity THEN RAISE EXCEPTION 'Select exactly % copies', v_t.quantity; END IF;
  SELECT count(*) INTO v_ok FROM book_copies WHERE book_id = v_t.book_id AND sticker_id = ANY(p_sticker_ids) AND current_center_id = v_t.from_center_id AND status = 'ALLOCATED_TO_CENTER';
  IF v_ok <> v_n THEN RAISE EXCEPTION 'Some selected copies are not free at your center'; END IF;
  UPDATE book_copies SET status='IN_TRANSIT', transfer_id=p_transfer_id WHERE book_id = v_t.book_id AND sticker_id = ANY(p_sticker_ids);
  UPDATE center_inventory SET currently_available = GREATEST(0, currently_available - v_n), updated_at = now() WHERE center_id = v_t.from_center_id AND book_id = v_t.book_id;
  UPDATE inventory_transfers SET status='DISPATCHED', copy_ids=p_sticker_ids, updated_at=now() WHERE id = p_transfer_id;
  RETURN v_n;
END; $$;

-- Receiving center confirms: counts move now
CREATE OR REPLACE FUNCTION public.accept_transfer(p_transfer_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_t inventory_transfers; v_n int;
BEGIN
  SELECT * INTO v_t FROM inventory_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF v_t.status <> 'DISPATCHED' THEN RAISE EXCEPTION 'Transfer is not dispatched yet'; END IF;
  IF NOT (is_admin(auth.uid()) OR (has_role(auth.uid(),'STUDY_CENTER') AND my_center_id(auth.uid()) = v_t.to_center_id)) THEN RAISE EXCEPTION 'Only the receiving center can mark received'; END IF;
  v_n := COALESCE(array_length(v_t.copy_ids,1), v_t.quantity);
  IF v_t.from_center_id IS NOT NULL THEN
    UPDATE center_inventory SET total_allocated = GREATEST(0, total_allocated - v_n), updated_at = now() WHERE center_id = v_t.from_center_id AND book_id = v_t.book_id;
  END IF;
  UPDATE book_copies SET status='ALLOCATED_TO_CENTER', current_center_id=v_t.to_center_id WHERE book_id = v_t.book_id AND sticker_id = ANY(v_t.copy_ids);
  INSERT INTO center_inventory (center_id, book_id, total_allocated, currently_available, currently_borrowed)
    VALUES (v_t.to_center_id, v_t.book_id, v_n, v_n, 0)
    ON CONFLICT (center_id, book_id) DO UPDATE SET total_allocated = center_inventory.total_allocated + v_n,
      currently_available = center_inventory.currently_available + v_n, updated_at = now();
  UPDATE inventory_transfers SET status='RECEIVED', updated_at=now() WHERE id = p_transfer_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.accept_book_request_with_stickers(uuid,text[],text), public.restock_with_stickers(uuid,uuid,text[]), public.create_relocation(uuid,uuid,uuid,int), public.dispatch_transfer(uuid,text[]), public.accept_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_book_request_with_stickers(uuid,text[],text), public.restock_with_stickers(uuid,uuid,text[]), public.create_relocation(uuid,uuid,uuid,int), public.dispatch_transfer(uuid,text[]), public.accept_transfer(uuid) TO authenticated;