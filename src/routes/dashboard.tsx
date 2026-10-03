import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Building2,
  Users,
  ArrowLeftRight,
  LogOut,
  Loader2,
  Library,
  HandCoins,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Shivaji University Book Bank" },
      {
        name: "description",
        content: "Your study center book bank dashboard.",
      },
      { property: "og:title", content: "Dashboard — Shivaji University Book Bank" },
      {
        property: "og:description",
        content: "Your study center book bank dashboard.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const roleLabels: Record<string, string> = {
  MAIN_ADMIN: "Main Admin",
  SUB_ADMIN: "Sub Admin",
  STUDY_CENTER: "Study Center",
  STUDENT: "Student",
};

function Dashboard() {
  const { session, loading, role, staffProfile, studentRecord, signOut } =
    useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/auth" });
    }
  }, [loading, session, navigate]);

  const centerId =
    role === "STUDENT" ? studentRecord?.center_id : staffProfile?.center_id;

  const stats = useQuery({
    queryKey: ["dashboard-stats", role, centerId],
    enabled: !!session && !!role,
    queryFn: async () => {
      const count = async (
        table: string,
        filter?: (q: any) => any,
      ): Promise<number> => {
        let q = supabase
          .from(table as any)
          .select("id", { count: "exact", head: true });
        if (filter) q = filter(q);
        const { count: c } = await q;
        return c ?? 0;
      };

      if (role === "STUDENT") {
        const sid = studentRecord?.id;
        return {
          borrowed: await count("student_transactions", (q) =>
            q.eq("student_id", sid).neq("status", "RETURNED"),
          ),
        };
      }
      if (role === "STUDY_CENTER") {
        return {
          students: await count("students", (q) => q.eq("center_id", centerId)),
          booksInStock: await count("center_inventory", (q) =>
            q.eq("center_id", centerId),
          ),
          activeLoans: await count("student_transactions", (q) =>
            q.eq("center_id", centerId).neq("status", "RETURNED"),
          ),
          incomingTransfers: await count("inventory_transfers", (q) =>
            q.eq("to_center_id", centerId).eq("status", "DISPATCHED"),
          ),
        };
      }
      return {
        centers: await count("study_centers"),
        students: await count("students"),
        books: await count("master_books"),
        pendingRequests: await count("book_requests", (q) =>
          q.eq("status", "SENT"),
        ),
      };
    },
  });

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const displayName =
    role === "STUDENT"
      ? studentRecord?.full_name
      : staffProfile?.full_name || session.user.email;

  const statCards =
    role === "STUDENT"
      ? [
          {
            icon: BookOpen,
            label: "Books currently borrowed",
            value: stats.data?.borrowed,
          },
        ]
      : role === "STUDY_CENTER"
        ? [
            { icon: Users, label: "Students", value: stats.data?.students },
            {
              icon: Library,
              label: "Book titles in stock",
              value: stats.data?.booksInStock,
            },
            {
              icon: BookOpen,
              label: "Active loans",
              value: stats.data?.activeLoans,
            },
            {
              icon: ArrowLeftRight,
              label: "Incoming transfers",
              value: stats.data?.incomingTransfers,
            },
          ]
        : [
            { icon: Building2, label: "Study centers", value: stats.data?.centers },
            { icon: Users, label: "Students", value: stats.data?.students },
            { icon: Library, label: "Books in catalog", value: stats.data?.books },
            {
              icon: HandCoins,
              label: "Pending book requests",
              value: stats.data?.pendingRequests,
            },
          ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-semibold text-foreground">Book Bank</span>
          </div>
          <button
            onClick={() => {
              void signOut().then(() => navigate({ to: "/" }));
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">
          Welcome{displayName ? `, ${displayName}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {role ? roleLabels[role] : "No role assigned yet — ask an admin to set up your account."}
          {studentRecord?.student_id ? ` · ID ${studentRecord.student_id}` : ""}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border bg-card p-5"
            >
              <s.icon className="h-6 w-6 text-primary" />
              <p className="mt-3 text-3xl font-bold text-card-foreground">
                {stats.isLoading ? "—" : (s.value ?? 0)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
          Detailed management screens (circulation, inventory, transfers,
          requests, donations) are being built next.
        </p>
      </main>
    </div>
  );
}
