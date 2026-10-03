import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, LayoutDashboard, Building2, UserCog, Library, ArrowLeftRight, Inbox,
  Users, Repeat, Boxes, Gift, BookMarked, KeyRound, LogOut, Loader2,
} from "lucide-react";
import { useAuth, type AppRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Select } from "@/components/kit";

type NavItem = { to: string; label: string; icon: any; roles: AppRole[] };
const ADMIN: AppRole[] = ["MAIN_ADMIN", "SUB_ADMIN"];
const STAFF: AppRole[] = ["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER"];
const ALL: AppRole[] = [...STAFF, "STUDENT"];

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, roles: ALL },
  { to: "/centers", label: "Centers", icon: Building2, roles: ADMIN },
  { to: "/staff", label: "Staff", icon: UserCog, roles: ADMIN },
  { to: "/books", label: "Catalog", icon: Library, roles: ADMIN },
  { to: "/students", label: "Students", icon: Users, roles: STAFF },
  { to: "/circulation", label: "Issue & Return", icon: Repeat, roles: STAFF },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: STAFF },
  { to: "/transfers", label: "Transfers", icon: ArrowLeftRight, roles: STAFF },
  { to: "/requests", label: "Requests", icon: Inbox, roles: STAFF },
  { to: "/donations", label: "Donations", icon: Gift, roles: STAFF },
  { to: "/my-books", label: "My Books", icon: BookMarked, roles: ["STUDENT"] },
  { to: "/account", label: "Account", icon: KeyRound, roles: ALL },
];

export const roleLabels: Record<AppRole, string> = {
  MAIN_ADMIN: "Main Admin",
  SUB_ADMIN: "Sub Admin",
  STUDY_CENTER: "Study Center",
  STUDENT: "Student",
};

export function AppShell({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { session, loading, role, staffProfile, studentRecord, signOut } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  if (loading || !session || (session && !role && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const items = NAV.filter((n) => role && n.roles.includes(role));
  const allowed = role && roles.includes(role);
  const name = role === "STUDENT" ? studentRecord?.full_name : staffProfile?.full_name;

  async function out() {
    await qc.cancelQueries();
    qc.clear();
    await signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:flex md:min-h-screen md:flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <BookOpen className="h-6 w-6 text-primary" />
          <span className="font-semibold text-foreground">Book Bank</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {items.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{ className: "bg-accent font-medium text-foreground" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <p className="truncate text-sm font-medium text-foreground">{name || session.user.email}</p>
          <p className="text-xs text-muted-foreground">{role ? roleLabels[role] : "No role"}</p>
          <button onClick={out} className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Book Bank</span>
            </div>
            <button onClick={out} className="flex items-center gap-1 text-sm text-muted-foreground">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {items.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground"
                activeProps={{ className: "border-primary bg-primary text-primary-foreground" }}
              >
                <n.icon className="h-3.5 w-3.5" />
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
          {allowed ? children : (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-muted-foreground">
              {role ? "This section isn't available for your role." : "Your account has no role yet — ask an admin to set it up."}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

export function useCenters() {
  return useQuery({
    queryKey: ["centers"],
    queryFn: async () => {
      const { data, error } = await db.from("study_centers").select("*").order("center_name");
      if (error) throw error;
      return data as { id: string; center_name: string; location: string }[];
    },
  });
}

/** Study center staff are locked to their center; admins choose one. */
export function useCenterScope() {
  const { role, staffProfile } = useAuth();
  const centers = useCenters();
  const locked = role === "STUDY_CENTER";
  const [picked, setPicked] = useState<string>("");
  useEffect(() => {
    if (!locked && !picked && centers.data?.[0]) setPicked(centers.data[0].id);
  }, [locked, picked, centers.data]);
  const centerId = locked ? staffProfile?.center_id ?? "" : picked;
  const center = centers.data?.find((c) => c.id === centerId);
  const picker = locked ? (
    <span className="rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">{center?.center_name ?? "Your center"}</span>
  ) : (
    <Select value={picked} onChange={(e) => setPicked(e.target.value)} className="w-auto min-w-48">
      {centers.data?.map((c) => (
        <option key={c.id} value={c.id}>{c.center_name}</option>
      ))}
    </Select>
  );
  return { centerId, center, picker, isAdmin: !locked };
}
