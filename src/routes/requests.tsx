import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Field, Select, TextInput, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db, rpc, fmtDate } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/requests")({
  head: pageHead("Book Requests", "Study centers request books; admins approve or reject."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER"]}>
      <Requests />
    </AppShell>
  ),
});

function Requests() {
  const { role } = useAuth();
  const isAdmin = role !== "STUDY_CENTER";
  const qc = useQueryClient();
  const [bookId, setBookId] = useState("");
  const [qty, setQty] = useState("1");
  const books = useQuery({ queryKey: ["books-mini"], queryFn: async () => (await db.from("master_books").select("id,title").order("title")).data ?? [] });
  const reqs = useQuery({
    queryKey: ["requests"],
    queryFn: async () => (await db.from("book_requests").select("*, master_books(title), study_centers(center_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["requests"] });

  async function send() {
    if (!bookId) { toast.error("Choose a book"); return; }
    if (await rpc("create_book_request", { p_book_id: bookId, p_quantity: Number(qty) })) {
      toast.success("Request sent to the university");
      setBookId(""); setQty("1");
      refresh();
    }
  }
  async function accept(r: any) {
    const n = prompt(`How many copies to send to ${r.study_centers?.center_name}? (requested ${r.quantity_needed})`, String(r.quantity_needed));
    if (!n) return;
    const sent = await rpc<number>("accept_book_request", { p_request_id: r.id, p_quantity: Number(n), p_remarks: "" });
    if (sent !== null) {
      toast.success(`Accepted — ${sent} copies added to the center's stock`);
      void qc.invalidateQueries();
    }
  }
  async function respond(id: string, status: "ACCEPTED" | "REJECTED") {
    const remarks = prompt(status === "ACCEPTED" ? "Remarks (optional)" : "Reason for rejecting") ?? "";
    if ((await rpc("respond_to_book_request", { p_request_id: id, p_status: status, p_remarks: remarks })) !== null) {
      toast.success(`Request ${status.toLowerCase()}`);
      refresh();
    }
  }
  async function clearAll() {
    if (!confirm("Delete all requests?")) return;
    const n = await rpc<number>("delete_all_book_requests");
    if (n !== null) { toast.success(`Deleted ${n} requests`); refresh(); }
  }

  return (
    <>
      <PageHeader
        title="Book Requests"
        sub={isAdmin ? "Review what centers need. Accepting sends the chosen number of copies straight to the center." : "Ask the university for more copies"}
        action={isAdmin && role === "MAIN_ADMIN" ? <Btn variant="outline" onClick={clearAll}>Clear all</Btn> : undefined}
      />
      {!isAdmin && (
        <Panel title="New request" className="mb-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
            <Field label="Book">
              <Select value={bookId} onChange={(e) => setBookId(e.target.value)}>
                <option value="">Select…</option>
                {books.data?.map((b: any) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </Select>
            </Field>
            <Field label="Copies"><TextInput type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
            <Btn onClick={send}>Send request</Btn>
          </div>
        </Panel>
      )}
      <Panel>
        {reqs.data?.length ? (
          <Table head={["Date", "Center", "Book", "Qty", "Status", "Remarks", ""]}>
            {reqs.data.map((r: any) => (
              <tr key={r.id}>
                <Td>{fmtDate(r.created_at)}</Td>
                <Td>{r.study_centers?.center_name}</Td>
                <Td className="font-medium">{r.master_books?.title}</Td>
                <Td>{r.quantity_needed}</Td>
                <Td><Tag tone={r.status === "ACCEPTED" ? "green" : r.status === "REJECTED" ? "red" : "amber"}>{r.status.toLowerCase()}</Tag></Td>
                <Td className="text-muted-foreground">{r.admin_remarks || "—"}</Td>
                <Td>
                  {isAdmin && r.status === "SENT" && (
                    <div className="flex gap-1.5">
                      <Btn onClick={() => accept(r)}>Accept</Btn>
                      <Btn variant="outline" onClick={() => respond(r.id, "REJECTED")}>Reject</Btn>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No requests.</Empty>}
      </Panel>
    </>
  );
}
