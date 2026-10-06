import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, useCenters } from "@/components/AppShell";
import { PageHeader, Panel, Field, Select, TextInput, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db, rpc, fmtDate } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/seo";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/transfers")({
  head: pageHead("Transfers", "Restock centers and relocate idle books between centers."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER"]}>
      <Transfers />
    </AppShell>
  ),
});

function StickerPicker({ copies, picked, setPicked, max }: { copies: any[]; picked: string[]; setPicked: (v: string[]) => void; max?: number }) {
  if (!copies.length) return <p className="text-sm text-muted-foreground">No copies available here.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {copies.map((c) => {
        const on = picked.includes(c.sticker_id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              if (on) setPicked(picked.filter((x) => x !== c.sticker_id));
              else if (!max || picked.length < max) setPicked([...picked, c.sticker_id]);
              else toast.error(`Only ${max} copies needed`);
            }}
            className={`rounded-md border px-2.5 py-1 font-mono text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}
          >
            {c.sticker_id}
          </button>
        );
      })}
    </div>
  );
}

function statusLabel(t: any) {
  if (t.status === "PENDING") return "pending";
  if (t.status === "DISPATCHED") return "dispatched";
  return "received";
}

function Transfers() {
  const { role, staffProfile } = useAuth();
  const isAdmin = role !== "STUDY_CENTER";
  const myCenter = staffProfile?.center_id ?? null;
  const qc = useQueryClient();
  const centers = useCenters();
  const books = useQuery({ queryKey: ["books-mini"], queryFn: async () => (await db.from("master_books").select("id,title").order("title")).data ?? [] });

  const [mode, setMode] = useState<"RESTOCK" | "RELOCATE">("RESTOCK");
  const [bookId, setBookId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("1");
  const [picked, setPicked] = useState<string[]>([]);
  const [dispatching, setDispatching] = useState<any>(null);

  const copies = useQuery({
    queryKey: ["xfer-copies", mode, bookId, from],
    enabled: isAdmin && !!bookId && (mode === "RESTOCK" || !!from),
    queryFn: async () => {
      let q = db.from("book_copies").select("id,sticker_id").eq("book_id", bookId);
      q = mode === "RESTOCK" ? q.eq("status", "AVAILABLE").is("current_center_id", null) : q.eq("status", "ALLOCATED_TO_CENTER").eq("current_center_id", from);
      return (await q.order("sticker_id")).data ?? [];
    },
  });

  const list = useQuery({
    queryKey: ["transfers", isAdmin, myCenter],
    enabled: isAdmin || !!myCenter,
    queryFn: async () => {
      let q = db
        .from("inventory_transfers")
        .select("*, master_books(title), from:study_centers!inventory_transfers_from_center_id_fkey(center_name), to:study_centers!inventory_transfers_to_center_id_fkey(center_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!isAdmin) q = q.or(`to_center_id.eq.${myCenter},from_center_id.eq.${myCenter}`);
      return (await q).data ?? [];
    },
  });

  async function send() {
    if (!bookId || !to) { toast.error("Choose book and destination"); return; }
    if (mode === "RESTOCK") {
      if (!picked.length) { toast.error("Pick copies"); return; }
      if (await rpc("restock_with_stickers", { p_book_id: bookId, p_to_center_id: to, p_sticker_ids: picked })) {
        toast.success(`${picked.length} copies dispatched — the center must mark them received`);
        setPicked([]); void qc.invalidateQueries();
      }
    } else {
      if (!from) { toast.error("Choose source center"); return; }
      if (await rpc("create_relocation", { p_book_id: bookId, p_from_center_id: from, p_to_center_id: to, p_quantity: Number(qty) })) {
        toast.success("Transfer created — waiting for the sending center to dispatch");
        setQty("1"); void qc.invalidateQueries();
      }
    }
  }

  async function receive(id: string) {
    if ((await rpc("accept_transfer", { p_transfer_id: id })) !== null) {
      toast.success("Received — books added to your inventory");
      void qc.invalidateQueries();
    }
  }

  const free = copies.data?.length ?? 0;

  return (
    <>
      <PageHeader title="Transfers" sub={isAdmin ? "Send university stock to centers or move idle books between centers" : "Transfers to and from your center"} />
      {isAdmin && (
        <Panel title="New transfer" className="mb-6">
          <div className="mb-4 flex flex-wrap gap-2">
            <Btn variant={mode === "RESTOCK" ? "primary" : "outline"} onClick={() => { setMode("RESTOCK"); setPicked([]); }}>Restock from university</Btn>
            <Btn variant={mode === "RELOCATE" ? "primary" : "outline"} onClick={() => { setMode("RELOCATE"); setPicked([]); }}>Move between centers</Btn>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Book">
              <Select value={bookId} onChange={(e) => { setBookId(e.target.value); setPicked([]); }}>
                <option value="">Select…</option>
                {books.data?.map((b: any) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </Select>
            </Field>
            {mode === "RELOCATE" && (
              <Field label="From center">
                <Select value={from} onChange={(e) => setFrom(e.target.value)}>
                  <option value="">Select…</option>
                  {centers.data?.map((c) => <option key={c.id} value={c.id}>{c.center_name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="To center">
              <Select value={to} onChange={(e) => setTo(e.target.value)}>
                <option value="">Select…</option>
                {centers.data?.filter((c) => c.id !== from).map((c) => <option key={c.id} value={c.id}>{c.center_name}</option>)}
              </Select>
            </Field>
            {mode === "RELOCATE" && (
              <Field label="Copies to move">
                <TextInput type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
              </Field>
            )}
          </div>
          {mode === "RESTOCK" && bookId && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pick copies ({picked.length} selected)</p>
              <StickerPicker copies={copies.data ?? []} picked={picked} setPicked={setPicked} />
            </div>
          )}
          {mode === "RELOCATE" && bookId && from && <p className="mt-3 text-sm text-muted-foreground">{free} free copies at the source center. That center will choose the sticker IDs when dispatching.</p>}
          <Btn onClick={send} className="mt-4">{mode === "RESTOCK" ? "Dispatch" : "Create transfer"}</Btn>
          <p className="mt-2 text-xs text-muted-foreground">Counts change only when the receiving center marks the books received.</p>
        </Panel>
      )}
      <Panel title="Transfer history">
        {list.data?.length ? (
          <Table head={["Date", "Book", "Type", "From", "To", "Qty", "Status", ""]}>
            {list.data.map((t: any) => {
              const canDispatch = t.status === "PENDING" && !isAdmin && t.from_center_id === myCenter;
              const canReceive = t.status === "DISPATCHED" && !isAdmin && t.to_center_id === myCenter;
              return (
                <tr key={t.id}>
                  <Td>{fmtDate(t.created_at)}</Td>
                  <Td className="font-medium">{t.master_books?.title}</Td>
                  <Td>{t.transfer_type === "RESTOCK" ? (t.request_id ? "Request" : "Restock") : "Relocation"}</Td>
                  <Td>{t.from?.center_name ?? "University"}</Td>
                  <Td>{t.to?.center_name}</Td>
                  <Td>{t.quantity}</Td>
                  <Td><Tag tone={t.status === "RECEIVED" ? "green" : t.status === "DISPATCHED" ? "amber" : "gray"}>{statusLabel(t)}</Tag></Td>
                  <Td>
                    {canDispatch && <Btn onClick={() => setDispatching(t)}>Dispatch</Btn>}
                    {canReceive && <Btn onClick={() => receive(t.id)}>Received</Btn>}
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>No transfers yet.</Empty>}
      </Panel>
      {dispatching && <DispatchDialog key={dispatching.id} t={dispatching} onClose={() => setDispatching(null)} onDone={() => { setDispatching(null); void qc.invalidateQueries(); }} />}
    </>
  );
}

function DispatchDialog({ t, onClose, onDone }: { t: any; onClose: () => void; onDone: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const copies = useQuery({
    queryKey: ["dispatch-copies", t.id],
    queryFn: async () => (await db.from("book_copies").select("id,sticker_id").eq("book_id", t.book_id).eq("current_center_id", t.from_center_id).eq("status", "ALLOCATED_TO_CENTER").order("sticker_id")).data ?? [],
  });
  async function submit() {
    setBusy(true);
    if ((await rpc("dispatch_transfer", { p_transfer_id: t.id, p_sticker_ids: picked })) !== null) {
      toast.success(`${picked.length} copies dispatched to ${t.to?.center_name}`);
      onDone();
    }
    setBusy(false);
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispatch books</DialogTitle>
          <DialogDescription>{t.master_books?.title} · to {t.to?.center_name} · {t.quantity} copies needed</DialogDescription>
        </DialogHeader>
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{picked.length} of {t.quantity} selected</span>
            {(copies.data?.length ?? 0) > 0 && (
              <button className="text-primary hover:underline" onClick={() => setPicked((copies.data ?? []).slice(0, t.quantity).map((c: any) => c.sticker_id))}>Pick {t.quantity}</button>
            )}
          </div>
          {copies.isLoading ? <p className="text-sm text-muted-foreground">Loading copies…</p> : <StickerPicker copies={copies.data ?? []} picked={picked} setPicked={setPicked} max={t.quantity} />}
        </div>
        <DialogFooter className="gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn onClick={submit} disabled={busy || picked.length !== t.quantity}>Dispatch {picked.length} copies</Btn>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
