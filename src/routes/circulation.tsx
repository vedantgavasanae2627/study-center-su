import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, useCenterScope } from "@/components/AppShell";
import { PageHeader, Panel, Field, Select, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db, rpc, fmtDate, overdueFine } from "@/lib/db";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/circulation")({
  head: pageHead("Issue & Return", "Issue, return and renew books for students."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER"]}>
      <Circulation />
    </AppShell>
  ),
});

function Circulation() {
  const qc = useQueryClient();
  const { centerId, picker } = useCenterScope();
  const [studentId, setStudentId] = useState("");
  const [bookId, setBookId] = useState("");
  const [copyId, setCopyId] = useState("");
  const [tab, setTab] = useState<"active" | "history">("active");

  const students = useQuery({
    queryKey: ["students", centerId, "mini"],
    enabled: !!centerId,
    queryFn: async () => (await db.from("students").select("id,full_name,student_id").eq("center_id", centerId).order("full_name")).data ?? [],
  });
  const stock = useQuery({
    queryKey: ["inventory", centerId],
    enabled: !!centerId,
    queryFn: async () => (await db.from("center_inventory").select("*, master_books(title,author)").eq("center_id", centerId)).data ?? [],
  });
  const copies = useQuery({
    queryKey: ["copies", centerId, bookId],
    enabled: !!bookId,
    queryFn: async () =>
      (await db.from("book_copies").select("id,sticker_id").eq("book_id", bookId).eq("current_center_id", centerId).eq("status", "ALLOCATED_TO_CENTER")).data ?? [],
  });
  const tx = useQuery({
    queryKey: ["tx", centerId, tab],
    enabled: !!centerId,
    queryFn: async () => {
      let q = db
        .from("student_transactions")
        .select("*, students(full_name,student_id), master_books(title), book_copies(sticker_id)")
        .eq("center_id", centerId)
        .order("issue_date", { ascending: false })
        .limit(100);
      q = tab === "active" ? q.neq("status", "RETURNED") : q.eq("status", "RETURNED");
      return (await q).data ?? [];
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["tx"] });
    void qc.invalidateQueries({ queryKey: ["inventory"] });
    void qc.invalidateQueries({ queryKey: ["copies"] });
  };

  async function issue() {
    if (!studentId || !bookId || !copyId) { toast.error("Choose student, book and copy"); return; }
    if (await rpc("issue_book", { p_student_id: studentId, p_book_id: bookId, p_center_id: centerId, p_copy_id: copyId })) {
      toast.success("Book issued for 14 days");
      setBookId(""); setCopyId("");
      refresh();
    }
  }
  async function ret(id: string) {
    const fine = await rpc<number>("return_book", { p_transaction_id: id });
    if (fine !== null) {
      toast.success(Number(fine) > 0 ? `Returned · collect fine ₹${fine}` : "Returned on time");
      refresh();
    }
  }
  async function renew(id: string) {
    const due = await rpc<string>("renew_book", { p_transaction_id: id });
    if (due) {
      toast.success(`Renewed until ${fmtDate(due)}`);
      refresh();
    }
  }

  return (
    <>
      <PageHeader title="Issue & Return" sub="14-day loans · ₹5/day late fine · 7-day renewal" action={picker} />
      <Panel title="Issue a book" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <Field label="Student">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select…</option>
              {students.data?.map((s: any) => <option key={s.id} value={s.id}>{s.full_name} ({s.student_id})</option>)}
            </Select>
          </Field>
          <Field label="Book">
            <Select value={bookId} onChange={(e) => { setBookId(e.target.value); setCopyId(""); }}>
              <option value="">Select…</option>
              {stock.data?.filter((i: any) => i.currently_available > 0).map((i: any) => (
                <option key={i.book_id} value={i.book_id}>{i.master_books?.title} ({i.currently_available} left)</option>
              ))}
            </Select>
          </Field>
          <Field label="Copy (sticker)">
            <Select value={copyId} onChange={(e) => setCopyId(e.target.value)} disabled={!bookId}>
              <option value="">Select…</option>
              {copies.data?.map((c: any) => <option key={c.id} value={c.id}>{c.sticker_id}</option>)}
            </Select>
          </Field>
          <Btn onClick={issue}>Issue book</Btn>
        </div>
      </Panel>
      <Panel>
        <div className="mb-4 flex gap-2">
          <Btn variant={tab === "active" ? "primary" : "outline"} onClick={() => setTab("active")}>On loan</Btn>
          <Btn variant={tab === "history" ? "primary" : "outline"} onClick={() => setTab("history")}>Returned</Btn>
        </div>
        {tx.data?.length ? (
          <Table head={["Book", "Sticker", "Student", "Issued", tab === "active" ? "Due" : "Returned", "Fine", ""]}>
            {tx.data.map((t: any) => {
              const fine = tab === "active" ? overdueFine(t.due_date) : Number(t.fine_amount);
              return (
                <tr key={t.id}>
                  <Td className="font-medium">{t.master_books?.title}</Td>
                  <Td className="font-mono text-xs">{t.book_copies?.sticker_id ?? "—"}</Td>
                  <Td>{t.students?.full_name}</Td>
                  <Td>{fmtDate(t.issue_date)}</Td>
                  <Td>{tab === "active" ? fmtDate(t.due_date) : fmtDate(t.return_date)}</Td>
                  <Td>{fine > 0 ? <Tag tone="red">₹{fine}</Tag> : <Tag tone="green">None</Tag>}</Td>
                  <Td>
                    {tab === "active" && (
                      <div className="flex gap-1.5">
                        <Btn onClick={() => ret(t.id)}>Return</Btn>
                        <Btn variant="outline" onClick={() => renew(t.id)} disabled={fine > 0} title={fine > 0 ? "Overdue books can't be renewed" : ""}>Renew</Btn>
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>{tab === "active" ? "No books on loan." : "No returns yet."}</Empty>}
      </Panel>
    </>
  );
}
