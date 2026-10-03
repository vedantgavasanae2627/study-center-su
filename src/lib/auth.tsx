import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "MAIN_ADMIN" | "SUB_ADMIN" | "STUDY_CENTER" | "STUDENT";

export interface StaffProfile {
  id: string;
  username_or_email: string;
  full_name: string;
  center_id: string | null;
}

export interface StudentRecord {
  id: string;
  full_name: string;
  student_id: string | null;
  center_id: string;
  course: string | null;
}

interface AuthState {
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  staffProfile: StaffProfile | null;
  studentRecord: StudentRecord | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null);
  const [studentRecord, setStudentRecord] = useState<StudentRecord | null>(
    null,
  );

  async function loadProfile(userId: string) {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const r = (roles?.[0]?.role as AppRole | undefined) ?? null;
    setRole(r);

    if (r === "STUDENT") {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, student_id, center_id, course")
        .eq("user_id", userId)
        .maybeSingle();
      setStudentRecord((data as StudentRecord | null) ?? null);
      setStaffProfile(null);
    } else if (r) {
      const { data } = await supabase
        .from("app_users")
        .select("id, username_or_email, full_name, center_id")
        .eq("id", userId)
        .maybeSingle();
      setStaffProfile((data as StaffProfile | null) ?? null);
      setStudentRecord(null);
    } else {
      setStaffProfile(null);
      setStudentRecord(null);
    }
  }

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        // Defer to avoid Supabase client deadlock
        setTimeout(() => {
          void loadProfile(s.user.id).finally(() => setLoading(false));
        }, 0);
      } else {
        setRole(null);
        setStaffProfile(null);
        setStudentRecord(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        void loadProfile(s.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return error ? error.message : null;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        role,
        staffProfile,
        studentRecord,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
