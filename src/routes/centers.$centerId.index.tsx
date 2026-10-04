import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Table, Td, Tag, Empty, TextInput, SortSelect, sortBooks, Crumbs, type SortKey } from "@/components/kit";
import { db, fmtDate } from "@/lib/db";
import { pageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/centers/$centerId/")({
  head: pageHead("Center Details", "Books, students and donated books at a study center."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN"]}>
      <CenterDetail />
    </AppShell>
  ),
});

type Tab = "books" | "students" | "donations";

export function useCenter(centerId: string) {
  return useQuery({
    queryKey: ["center", centerId],
    queryFn: async () => (await db.from("study_centers").select("*").eq("id", centerId).maybeSingle()).data,
  });
}

function CenterDetail() {
  const { centerId } = Route.useParams();
  const nav = useNavigate();
  const center = useCenter(centerId);
  const [tab, setTab] = useState<Tab>("books");
  const [sort, setSort] = useState<SortKey>("az");
  const [search, setSearch] = useState("");

  const data = useQuery({
    queryKey: ["center-detail", centerId],
    queryFn: async () => {
      const [{ data: inv }, { data: st }, { data: don }, { data: tx }] = await Promise.all([
        db.from("center_inventory").select("*, master_books(title,author)").eq("center_id", centerId),
        db.from("students").select("*").eq("center_id", centerId).order("full_name"),
        db.from("book_donations").select("*, students(full_name)").eq("center_id", centerId).order("created_at", { ascending: false }),
        db.from("student_transactions").select("student_id").eq("center_id", centerId).neq("status", "RETURNED"),
      ]);
      const loans: Record<string, number> = {};
      tx?.forEach((t: any) => (loans[t.student_id] = (loans[t.student_id] ?? 0) + 1));
      return {
        inv: inv ?? [],
        students: (st ?? []).map((s: any) => ({ ...s, loans: loans[s.id] ?? 0 })),
        donations: don ?? [],
      };
    },
  });

  const d = data.data;
  const s = search.toLowerCase();
  const books = sortBooks(
    (d?.inv ?? []).filter((i: any) => `${i.master_books?.title} ${i.master_books?.author}`.toLowerCase().includes(s)),
    sort, (i: any) => i.master_books?.title ?? "", (i: any) => i.total_allocated,
  );
  const students = (d?.students ?? []).filter((x: any) => `${x.full_name} ${x.prn} ${x.student_id}`.toLowerCase().includes(s));
  const donations = sortBooks(
    (d?.donations ?? []).filter((x: any) => `${x.book_name} ${x.author} ${x.sticker_id}`.toLowerCase().includes(s)),
    sort, (x: any) => x.book_name, () => 1,
  );
  const total = (d?.inv ?? []).reduce((a: number, i: any) => a + i.total_allocated, 0);
  const avail = (d?.inv ?? []).reduce((a: number, i: any) => a + i.currently_available, 0);
  const out = (d?.inv ?? []).reduce((a: number, i: any) => a + i.currently_borrowed, 0);
  const name = center.data?.center_name ?? "Center";

  const tabs: { k: Tab; label: string; n: number }[] = [
    { k: "books", label: "Books", n: d?.inv.length ?? 0 },
    { k: "students", label: "Students", n: d?.students.length ?? 0 },
    { k: "donations", label: "Donated books", n: d?.donations.length ?? 0 },
  ];

  return (
    <>
      <Crumbs items={[{ label: "Centers", to: () => nav({ to: "/centers" }) }, { label: name }]} />
      <PageHeader title={name} sub={`${center.data?.location ?? ""} · view only`} />
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[["Total books", total], ["Available", avail], ["Issued", out]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-2xl font-bold text-foreground">{v}</p>
          </div>
        ))}
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.k}
            onClick={() => { setTab(t.k); setSearch(""); }}
            className={cn(
              "shrink-0 rounded-full border px-4 py-1.5 text-sm",
              tab === t.k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground",
            )}
          >
            {t.label} ({t.n})
          </button>
        ))}
      </div>
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          <TextInput placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1" />
          {tab !== "students" && <SortSelect value={sort} onChange={setSort} />}
        </div>

        {tab === "books" && (books.length ? (
          <Table head={["Title", "Author", "Total", "Available", "Issued", "Last issued"]}>
            {books.map((i: any) => (
              <tr key={i.id} className="cursor-pointer hover:bg-muted/50"
                onClick={() => nav({ to: "/centers/$centerId/books/$bookId", params: { centerId, bookId: i.book_id } })}>
                <Td className="font-medium">{i.master_books?.title}</Td>
                <Td>{i.master_books?.author}</Td>
                <Td>{i.total_allocated}</Td>
                <Td>{i.currently_available}</Td>
                <Td>{i.currently_borrowed}</Td>
                <Td>{fmtDate(i.last_issued_date)}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No books at this center.</Empty>)}

        {tab === "students" && (students.length ? (
          <Table head={["Name", "PRN", "Student ID", "Course", "Books out"]}>
            {students.map((x: any) => (
              <tr key={x.id} className="cursor-pointer hover:bg-muted/50"
                onClick={() => nav({ to: "/centers/$centerId/students/$studentId", params: { centerId, studentId: x.id } })}>
                <Td className="font-medium">{x.full_name}</Td>
                <Td>{x.prn}</Td>
                <Td className="font-mono text-xs">{x.student_id}</Td>
                <Td>{x.course}</Td>
                <Td>{x.loans}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No students at this center.</Empty>)}

        {tab === "donations" && (donations.length ? (
          <Table head={["Date", "Book", "Sticker", "Donated by", "PRN", "Condition", "Status"]}>
            {donations.map((x: any) => (
              <tr key={x.id}>
                <Td>{fmtDate(x.created_at)}</Td>
                <Td className="font-medium">{x.book_name}<span className="block text-xs text-muted-foreground">{x.author}</span></Td>
                <Td className="font-mono text-xs">{x.sticker_id}</Td>
                <Td>{x.students?.full_name ?? "—"}</Td>
                <Td>{x.prn || "—"}</Td>
                <Td>{x.condition}</Td>
                <Td><Tag tone={x.status === "ADDED_TO_CATALOG" ? "green" : "amber"}>{x.status === "ADDED_TO_CATALOG" ? "In center stock" : "Donated"}</Tag></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No donated books at this center.</Empty>)}

        {tab !== "donations" && <p className="mt-3 text-xs text-muted-foreground">Tap a row for details.</p>}
      </Panel>
    </>
  );
}
