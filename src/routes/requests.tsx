import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Field, Select, TextInput, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db, rpc, fmtDate } from "@/lib/db";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
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
  const [active, setActive] = useState<{ r: any; mode: "accept" | "reject" } | null>(null);
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
                      <Btn onClick={() => setActive({ r, mode: "accept" })}>Accept</Btn>
                      <Btn variant="outline" onClick={() => setActive({ r, mode: "reject" })}>Reject</Btn>
                    </div>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No requests.</Empty>}
      </Panel>
      {active && <RespondDialog key={active.r.id} r={active.r} mode={active.mode} onClose={() => setActive(null)} onDone={() => { setActive(null); void qc.invalidateQueries(); }} />}
    </>
  );
}

function RespondDialog({ r, mode, onClose, onDone }: { r: any; mode: "accept" | "reject"; onClose: () => void; onDone: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const copies = useQuery({
    queryKey: ["free-copies", r.book_id],
    enabled: mode === "accept",
    queryFn: async () =>
      ((await db.from("book_copies").select("id,sticker_id").eq("book_id", r.book_id).eq("status", "AVAILABLE").is("current_center_id", null).order("sticker_id")).data ?? []) as { id: string; sticker_id: string }[],
  });
  const list = copies.data ?? [];
  const toggle = (sid: string) => setPicked((p) => (p.includes(sid) ? p.filter((x) => x !== sid) : [...p, sid]));
  const autoPick = () => setPicked(list.slice(0, r.quantity_needed).map((c) => c.sticker_id));

  async function submit() {
    setBusy(true);
    if (mode === "accept") {
      if (!picked.length) { toast.error("Select at least one copy"); setBusy(false); return; }
      const n = await rpc<number>("accept_book_request_with_stickers", { p_request_id: r.id, p_sticker_ids: picked, p_remarks: remarks });
      if (n !== null) { toast.success(`Accepted — ${n} copies added to ${r.study_centers?.center_name}`); onDone(); }
    } else {
      if (!remarks.trim()) { toast.error("Please give a reason"); setBusy(false); return; }
      if ((await rpc("respond_to_book_request", { p_request_id: r.id, p_status: "REJECTED", p_remarks: remarks })) !== null) { toast.success("Request rejected"); onDone(); }
    }
    setBusy(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "accept" ? "Accept request" : "Reject request"}</DialogTitle>
          <DialogDescription>
            {r.master_books?.title} · {r.study_centers?.center_name} · {r.quantity_needed} requested
          </DialogDescription>
        </DialogHeader>

        {mode === "accept" && (
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Choose copies to send ({picked.length} selected, {list.length} at university)</span>
              {list.length > 0 && <button onClick={autoPick} className="text-primary hover:underline">Pick {Math.min(r.quantity_needed, list.length)}</button>}
            </div>
            {copies.isLoading ? <p className="text-sm text-muted-foreground">Loading copies…</p> : list.length ? (
              <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                {list.map((c) => (
                  <button key={c.id} type="button" onClick={() => toggle(c.sticker_id)}
                    className={cn("rounded-md border px-2 py-2 font-mono text-xs", picked.includes(c.sticker_id) ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:border-primary")}>
                    {c.sticker_id}
                  </button>
                ))}
              </div>
            ) : <Empty>No free copies at the university for this book.</Empty>}
          </div>
        )}

        <Field label={mode === "accept" ? "Remarks (optional)" : "Reason for rejecting"}>
          <TextInput value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </Field>

        <DialogFooter className="gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant={mode === "reject" ? "danger" : "primary"} onClick={submit} disabled={busy || (mode === "accept" && !picked.length)}>
            {mode === "accept" ? `Send ${picked.length || ""} copies` : "Reject"}
          </Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
