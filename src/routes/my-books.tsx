import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Tag, Empty, TextInput, Btn } from "@/components/kit";
import { rpc, db, fmtDate, overdueFine } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/my-books")({
  head: pageHead("My Books", "Books you've borrowed, due dates and fines."),
  component: () => (
    <AppShell roles={["STUDENT"]}>
      <MyBooks />
    </AppShell>
  ),
});

function MyBooks() {
  const { studentRecord } = useAuth();
  const tx = useQuery({
    queryKey: ["my-tx", studentRecord?.id],
    enabled: !!studentRecord,
    queryFn: async () =>
      (await db.from("student_transactions").select("*, master_books(title,author), study_centers(center_name)").eq("student_id", studentRecord!.id).order("issue_date", { ascending: false })).data ?? [],
  });
  const stock = useQuery({
    queryKey: ["my-center-stock", studentRecord?.center_id],
    enabled: !!studentRecord?.center_id,
    queryFn: async () =>
      (await db.from("center_inventory").select("id,currently_available,total_allocated,master_books(title,author)").eq("center_id", studentRecord!.center_id)).data ?? [],
  });
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const catalog = useQuery({
    queryKey: ["my-catalog", studentRecord?.id],
    enabled: !!studentRecord,
    queryFn: async () => {
      const [{ data: b }, { data: d }] = await Promise.all([
        db.from("master_books").select("id,title,author").order("title"),
        db.from("book_demands").select("book_id").eq("student_id", studentRecord!.id),
      ]);
      return { books: b ?? [], asked: new Set((d ?? []).map((x: any) => x.book_id)) };
    },
  });
  const atCenter = new Set((stock.data ?? []).filter((i: any) => i.total_allocated > 0).map((i: any) => i.master_books?.title));
  const missing = search.trim().length < 2 ? [] : (catalog.data?.books ?? [])
    .filter((b: any) => !atCenter.has(b.title) && `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));
  async function demand(bookId: string) {
    const r = await rpc("request_book_demand", { p_book_id: bookId });
    if (r) { toast.success("Request sent to the university"); void qc.invalidateQueries({ queryKey: ["my-catalog"] }); }
  }
  const avail = (stock.data ?? [])
    .filter((i: any) => `${i.master_books?.title} ${i.master_books?.author}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => (a.master_books?.title ?? "").localeCompare(b.master_books?.title ?? ""));
  const active = (tx.data ?? []).filter((t: any) => t.status !== "RETURNED");
  const past = (tx.data ?? []).filter((t: any) => t.status === "RETURNED");
  const totalFine = active.reduce((s: number, t: any) => s + overdueFine(t.due_date), 0);

  return (
    <>
      <PageHeader title="My Books" sub={totalFine ? `Current fine due: ₹${totalFine}` : "No fines due"} />
      <Panel title="Currently borrowed" className="mb-6">
        {active.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((t: any) => {
              const fine = overdueFine(t.due_date);
              const days = Math.ceil((new Date(t.due_date).getTime() - Date.now()) / 864e5);
              return (
                <div key={t.id} className="rounded-lg border border-border p-4">
                  <p className="font-semibold text-foreground">{t.master_books?.title}</p>
                  <p className="text-sm text-muted-foreground">{t.master_books?.author} · {t.study_centers?.center_name}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-foreground">Due {fmtDate(t.due_date)}</span>
                    {fine ? <Tag tone="red">Overdue · ₹{fine}</Tag> : <Tag tone={days <= 3 ? "amber" : "green"}>{days} days left</Tag>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Empty>You have no borrowed books.</Empty>}
      </Panel>
      <Panel title="Books at my study center" className="mb-6">
        <TextInput placeholder="Search books…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
        {avail.length ? (
          <ul className="divide-y divide-border text-sm">
            {avail.map((i: any) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-2.5">
                <span><span className="font-medium text-foreground">{i.master_books?.title}</span><span className="block text-xs text-muted-foreground">{i.master_books?.author}</span></span>
                {i.currently_available > 0 ? <Tag tone="green">{i.currently_available} available</Tag> : <Tag tone="gray">All issued</Tag>}
              </li>
            ))}
          </ul>
        ) : <Empty>No books found at your center.</Empty>}
        {missing.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Not at your center — request it from the university</p>
            <ul className="divide-y divide-border text-sm">
              {missing.map((b: any) => (
                <li key={b.id} className="flex items-center justify-between gap-2 py-2.5">
                  <span><span className="font-medium text-foreground">{b.title}</span><span className="block text-xs text-muted-foreground">{b.author}</span></span>
                  {catalog.data?.asked.has(b.id) ? <Tag tone="amber">Requested</Tag> : <Btn variant="outline" onClick={() => demand(b.id)}>Request</Btn>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
      <Panel title="History">
        {past.length ? (
          <ul className="divide-y divide-border text-sm">
            {past.map((t: any) => (
              <li key={t.id} className="flex justify-between gap-2 py-2.5">
                <span className="text-foreground">{t.master_books?.title}</span>
                <span className="text-muted-foreground">returned {fmtDate(t.return_date)}{Number(t.fine_amount) > 0 && ` · ₹${t.fine_amount}`}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>No past loans.</Empty>}
      </Panel>
    </>
  );
}
