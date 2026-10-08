import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Building2, Users, ArrowLeftRight, Library, HandCoins, AlertTriangle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { db, fmtDate, overdueFine } from "@/lib/db";
import { AppShell, roleLabels } from "@/components/AppShell";
import { PageHeader, Panel, Tag, Empty } from "@/components/kit";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/dashboard")({
  head: pageHead("Dashboard", "Your study center book bank overview."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER", "STUDENT"]}>
      <Dashboard />
    </AppShell>
  ),
});

async function count(table: string, f?: (q: any) => any) {
  let q = db.from(table).select("id", { count: "exact", head: true });
  if (f) q = f(q);
  const { count: c } = await q;
  return (c ?? 0) as number;
}

function Dashboard() {
  const { role, staffProfile, studentRecord } = useAuth();
  const centerId = staffProfile?.center_id;

  const stats = useQuery({
    queryKey: ["dash", role, centerId, studentRecord?.id],
    enabled: !!role,
    queryFn: async () => {
      if (role === "STUDENT") {
        const sid = studentRecord?.id;
        return [
          { icon: BookOpen, label: "Books borrowed", value: await count("student_transactions", (q) => q.eq("student_id", sid).neq("status", "RETURNED")), to: "/my-books" },
        ];
      }
      if (role === "STUDY_CENTER") {
        return [
          { icon: Users, label: "Students", value: await count("students", (q) => q.eq("center_id", centerId)), to: "/students" },
          { icon: Library, label: "Titles in stock", value: await count("center_inventory", (q) => q.eq("center_id", centerId)), to: "/inventory" },
          { icon: BookOpen, label: "Active loans", value: await count("student_transactions", (q) => q.eq("center_id", centerId).neq("status", "RETURNED")), to: "/circulation" },
          { icon: ArrowLeftRight, label: "Incoming transfers", value: await count("inventory_transfers", (q) => q.eq("to_center_id", centerId).eq("status", "DISPATCHED")), to: "/transfers" },
        ];
      }
      return [
        { icon: Building2, label: "Study centers", value: await count("study_centers"), to: "/centers" },
        { icon: Users, label: "Students", value: await count("students"), to: "/students" },
        { icon: Library, label: "Titles in catalog", value: await count("master_books"), to: "/books" },
        { icon: HandCoins, label: "Pending requests", value: await count("book_requests", (q) => q.eq("status", "SENT")), to: "/requests" },
      ];
    },
  });

  const overdue = useQuery({
    queryKey: ["dash-overdue", role, centerId, studentRecord?.id],
    enabled: role === "STUDY_CENTER" || role === "STUDENT",
    queryFn: async () => {
      let q = db
        .from("student_transactions")
        .select("id,due_date,students(full_name),master_books(title),study_centers(center_name)")
        .neq("status", "RETURNED")
        .lt("due_date", new Date().toISOString())
        .order("due_date")
        .limit(8);
      if (role === "STUDENT") q = q.eq("student_id", studentRecord?.id);
      const { data } = await q;
      return (data ?? []) as any[];
    },
  });

  const isAdmin = role === "MAIN_ADMIN" || role === "SUB_ADMIN";
  const suggest = useQuery({
    queryKey: ["dash-suggest"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: dm }, { data: inv }, { data: uni }] = await Promise.all([
        db.from("book_demands").select("book_id,center_id,master_books(title),study_centers(center_name)"),
        db.from("center_inventory").select("book_id,center_id,currently_available,currently_borrowed,study_centers(center_name)"),
        db.from("book_copies").select("book_id").eq("status", "AVAILABLE").is("current_center_id", null),
      ]);
      const g: Record<string, any> = {};
      (dm ?? []).forEach((d: any) => {
        const k = d.book_id + d.center_id;
        (g[k] ??= { ...d, count: 0 }).count++;
      });
      return Object.values(g).sort((a: any, b: any) => b.count - a.count).map((d: any) => {
        const has = new Set((inv ?? []).filter((i: any) => i.center_id === d.center_id && i.book_id === d.book_id).map(() => 1));
        const idle = (inv ?? []).filter((i: any) => i.book_id === d.book_id && i.center_id !== d.center_id && i.currently_available > 0 && i.currently_borrowed === 0);
        const atUni = (uni ?? []).filter((c: any) => c.book_id === d.book_id).length;
        return { ...d, idle, atUni, fulfilled: has.size > 0 };
      }).filter((d: any) => !d.fulfilled);
    },
  });
  const name = role === "STUDENT" ? studentRecord?.full_name : staffProfile?.full_name;

  return (
    <>
      <PageHeader
        title={`Welcome${name ? `, ${name}` : ""}`}
        sub={`${role ? roleLabels[role] : ""}${studentRecord?.student_id ? ` · ID ${studentRecord.student_id}` : ""}`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(stats.data ?? []).map((s) => (
          <Link key={s.label} to={s.to} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary">
            <s.icon className="h-5 w-5 text-primary" />
            <p className="mt-3 text-3xl font-bold text-card-foreground">{s.value}</p>
            <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
          </Link>
        ))}
      </div>
      {isAdmin && <Panel title="Student demand & transfer suggestions" className="mt-6">
        {suggest.data?.length ? (
          <ul className="divide-y divide-border">
            {suggest.data.map((d: any) => (
              <li key={d.book_id + d.center_id} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{d.master_books?.title} <span className="text-muted-foreground">→ {d.study_centers?.center_name}</span></p>
                  <Tag tone="amber">{d.count} student{d.count > 1 ? "s" : ""} asked</Tag>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {d.idle.length
                    ? <>Idle at {d.idle.map((i: any) => `${i.study_centers?.center_name} (${i.currently_available})`).join(", ")} — relocate from there.</>
                    : d.atUni ? <>{d.atUni} copies free at the university — restock.</> : <>No free copies anywhere — consider buying more.</>}
                </p>
              </li>
            ))}
          </ul>
        ) : <Empty>No open student requests.</Empty>}
        <Link to="/transfers" className="mt-3 inline-block text-sm font-medium text-primary">Go to Transfers →</Link>
      </Panel>}
      {(role === "STUDY_CENTER" || role === "STUDENT") && <Panel title="Overdue books" className="mt-6">
        {overdue.data?.length ? (
          <ul className="divide-y divide-border">
            {overdue.data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <p className="font-medium text-foreground">{t.master_books?.title}</p>
                  <p className="text-muted-foreground">
                    {role !== "STUDENT" && `${t.students?.full_name} · `}{t.study_centers?.center_name} · due {fmtDate(t.due_date)}
                  </p>
                </div>
                <Tag tone="red"><AlertTriangle className="mr-1 inline h-3 w-3" />₹{overdueFine(t.due_date)} fine</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No overdue books. 🎉</Empty>
        )}
      </Panel>}
    </>
  );
}
