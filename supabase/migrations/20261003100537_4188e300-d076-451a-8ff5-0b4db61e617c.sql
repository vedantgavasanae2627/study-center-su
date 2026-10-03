DO $$ BEGIN CREATE TYPE app_role AS ENUM ('MAIN_ADMIN','SUB_ADMIN','STUDY_CENTER','STUDENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transaction_status AS ENUM ('ISSUED','RETURNED','RENEWED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transfer_type AS ENUM ('RESTOCK','IDLE_RELOCATION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE transfer_status AS ENUM ('PENDING','DISPATCHED','RECEIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE book_request_status AS ENUM ('SENT','ACCEPTED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE study_centers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), center_name text NOT NULL, location text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL, role app_role NOT NULL, UNIQUE (user_id, role));

CREATE TABLE app_users (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, username_or_email text NOT NULL UNIQUE, full_name text NOT NULL DEFAULT '', center_id uuid REFERENCES study_centers(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE students (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, prn text NOT NULL UNIQUE, full_name text NOT NULL, college_name text NOT NULL DEFAULT '', branch text NOT NULL DEFAULT '', semester int NOT NULL DEFAULT 1, center_id uuid NOT NULL REFERENCES study_centers(id) ON DELETE RESTRICT, student_id text UNIQUE, enrollment_year int, course text, year_of_study int, phone text, email text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE master_books (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, author text NOT NULL DEFAULT '', total_university_quantity int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE book_copies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL REFERENCES master_books(id) ON DELETE CASCADE, sticker_id text NOT NULL, current_center_id uuid REFERENCES study_centers(id) ON DELETE SET NULL, current_student_id uuid REFERENCES students(id) ON DELETE SET NULL, status text NOT NULL DEFAULT 'AVAILABLE', transfer_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT book_copies_book_sticker_key UNIQUE (book_id, sticker_id));

CREATE TABLE center_inventory (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), center_id uuid NOT NULL REFERENCES study_centers(id) ON DELETE CASCADE, book_id uuid NOT NULL REFERENCES master_books(id) ON DELETE CASCADE, total_allocated int NOT NULL DEFAULT 0, currently_available int NOT NULL DEFAULT 0, currently_borrowed int NOT NULL DEFAULT 0, last_issued_date timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT center_inventory_center_book_key UNIQUE (center_id, book_id));

CREATE TABLE student_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id) ON DELETE RESTRICT, book_id uuid NOT NULL REFERENCES master_books(id) ON DELETE RESTRICT, center_id uuid NOT NULL REFERENCES study_centers(id) ON DELETE RESTRICT, copy_id uuid REFERENCES book_copies(id) ON DELETE SET NULL, status transaction_status NOT NULL DEFAULT 'ISSUED', issue_date timestamptz NOT NULL DEFAULT now(), due_date timestamptz NOT NULL, return_date timestamptz, fine_amount numeric(10,2) NOT NULL DEFAULT 0.0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE inventory_transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL REFERENCES master_books(id) ON DELETE RESTRICT, from_center_id uuid REFERENCES study_centers(id) ON DELETE SET NULL, to_center_id uuid NOT NULL REFERENCES study_centers(id) ON DELETE RESTRICT, quantity int NOT NULL, transfer_type transfer_type NOT NULL DEFAULT 'RESTOCK', status transfer_status NOT NULL DEFAULT 'PENDING', copy_ids text[], created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE book_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), center_id uuid NOT NULL REFERENCES study_centers(id) ON DELETE CASCADE, book_id uuid NOT NULL REFERENCES master_books(id) ON DELETE RESTRICT, quantity_needed int NOT NULL DEFAULT 1, status book_request_status NOT NULL DEFAULT 'SENT', admin_remarks text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE book_donations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), center_id uuid NOT NULL REFERENCES study_centers(id) ON DELETE CASCADE, student_id uuid REFERENCES students(id) ON DELETE SET NULL, prn text NOT NULL DEFAULT '', book_name text NOT NULL, author text NOT NULL DEFAULT '', sticker_id text NOT NULL, condition text NOT NULL DEFAULT 'Good', status text NOT NULL DEFAULT 'DONATED', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

ALTER TABLE book_copies ADD CONSTRAINT book_copies_transfer_fk FOREIGN KEY (transfer_id) REFERENCES inventory_transfers(id) ON DELETE SET NULL;

CREATE INDEX idx_app_users_center ON app_users(center_id);
CREATE INDEX idx_students_center ON students(center_id);
CREATE INDEX idx_students_student_id ON students(student_id);
CREATE INDEX idx_students_user ON students(user_id);
CREATE INDEX idx_center_inventory_center ON center_inventory(center_id);
CREATE INDEX idx_center_inventory_book ON center_inventory(book_id);
CREATE INDEX idx_book_copies_book ON book_copies(book_id);
CREATE INDEX idx_book_copies_center ON book_copies(current_center_id);
CREATE INDEX idx_book_copies_status ON book_copies(status);
CREATE INDEX idx_student_transactions_student ON student_transactions(student_id);
CREATE INDEX idx_student_transactions_center ON student_transactions(center_id);
CREATE INDEX idx_student_transactions_status ON student_transactions(status);
CREATE INDEX idx_inventory_transfers_to ON inventory_transfers(to_center_id);
CREATE INDEX idx_inventory_transfers_status ON inventory_transfers(status);
CREATE INDEX idx_book_requests_center ON book_requests(center_id);
CREATE INDEX idx_book_donations_center ON book_donations(center_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON study_centers TO authenticated; GRANT ALL ON study_centers TO service_role;
GRANT SELECT ON user_roles TO authenticated; GRANT ALL ON user_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_users TO authenticated; GRANT ALL ON app_users TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON students TO authenticated; GRANT ALL ON students TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON master_books TO authenticated; GRANT ALL ON master_books TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON book_copies TO authenticated; GRANT ALL ON book_copies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON center_inventory TO authenticated; GRANT ALL ON center_inventory TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON student_transactions TO authenticated; GRANT ALL ON student_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_transfers TO authenticated; GRANT ALL ON inventory_transfers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON book_requests TO authenticated; GRANT ALL ON book_requests TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON book_donations TO authenticated; GRANT ALL ON book_donations TO service_role;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_sc BEFORE UPDATE ON study_centers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_au BEFORE UPDATE ON app_users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_st BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_mb BEFORE UPDATE ON master_books FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bc BEFORE UPDATE ON book_copies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_ci BEFORE UPDATE ON center_inventory FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tx BEFORE UPDATE ON student_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_it BEFORE UPDATE ON inventory_transfers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_br BEFORE UPDATE ON book_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bd BEFORE UPDATE ON book_donations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('MAIN_ADMIN','SUB_ADMIN','STUDY_CENTER')) $$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('MAIN_ADMIN','SUB_ADMIN')) $$;

CREATE OR REPLACE FUNCTION public.my_center_id(_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT center_id FROM public.app_users WHERE id = _user_id $$;

CREATE OR REPLACE FUNCTION public.my_student_id(_user_id uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT id FROM public.students WHERE user_id = _user_id $$;

ALTER TABLE study_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY sc_select ON study_centers FOR SELECT TO authenticated USING (true);
CREATE POLICY sc_modify ON study_centers FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY ur_select ON user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY au_select ON app_users FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY au_modify ON app_users FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR id = auth.uid()) WITH CHECK (public.is_admin(auth.uid()) OR id = auth.uid());

CREATE POLICY st_select ON students FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND center_id = public.my_center_id(auth.uid())) OR user_id = auth.uid());
CREATE POLICY st_modify ON students FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND center_id = public.my_center_id(auth.uid()))) WITH CHECK (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND center_id = public.my_center_id(auth.uid())));

CREATE POLICY mb_select ON master_books FOR SELECT TO authenticated USING (true);
CREATE POLICY mb_modify ON master_books FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY bc_select ON book_copies FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY bc_modify ON book_copies FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY ci_select ON center_inventory FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND center_id = public.my_center_id(auth.uid())));
CREATE POLICY ci_modify ON center_inventory FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY tx_select ON student_transactions FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND center_id = public.my_center_id(auth.uid())) OR student_id = public.my_student_id(auth.uid()));
CREATE POLICY tx_modify ON student_transactions FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY it_select ON inventory_transfers FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND (to_center_id = public.my_center_id(auth.uid()) OR from_center_id = public.my_center_id(auth.uid()))));
CREATE POLICY it_modify ON inventory_transfers FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY br_select ON book_requests FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND center_id = public.my_center_id(auth.uid())));
CREATE POLICY br_modify ON book_requests FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY bd_select ON book_donations FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR (public.has_role(auth.uid(),'STUDY_CENTER') AND center_id = public.my_center_id(auth.uid())) OR student_id = public.my_student_id(auth.uid()));
CREATE POLICY bd_modify ON book_donations FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));