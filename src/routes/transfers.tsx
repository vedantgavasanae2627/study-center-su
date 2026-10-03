import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, useCenters } from "@/components/AppShell";
import { PageHeader, Panel, Field, Select, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db, rpc, fmtDate } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/transfers")({
  head: pageHead("Transfers", "Restock centers and relocate idle books between centers."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER"]}>
      <Transfers />
    </AppShell>
  ),
});

function StickerPicker({ copies, picked, setPicked }: { copies: any[]; picked: string[]; setPicked: (v: string[]) => void }) {
  if (!copies.length) return <p className="text-sm text-muted-foreground">No copies available here.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {copies.map((c) => {
        const on = picked.includes(c.sticker_id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => setPicked(on ? picked.filter((x) => x !== c.sticker_id) : [...picked, c.sticker_id])}
            className={`rounded-md border px-2.5 py-1 font-mono text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"}`}
          >
            {c.sticker_id}
          </button>
        );
      })}
    </div>
  );
}

function Transfers() {
  const { role, staffProfile } = useAuth();
  const isAdmin = role !== "STUDY_CENTER";
  const qc = useQueryClient();
  const centers = useCenters();
  const books = useQuery({ queryKey: ["books-mini"], queryFn: async () => (await db.from("master_books").select("id,title").order("title")).data ?? [] });

  const [mode, setMode] = useState<"RESTOCK" | "RELOCATE">("RESTOCK");
  const [bookId, setBookId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

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
    queryKey: ["transfers"],
    queryFn: async () =>
      (await db
        .from("inventory_transfers")
        .select("*, master_books(title), from:study_centers!inventory_transfers_from_center_id_fkey(center_name), to:study_centers!inventory_transfers_to_center_id_fkey(center_name)")
        .order("created_at", { ascending: false })
        .limit(100)).data ?? [],
  });

  async function send() {
    if (!bookId || !to || !picked.length) return toast.error("Choose book, destination and copies");
    const r =
      mode === "RESTOCK"
        ? await rpc("restock_with_stickers", { p_book_id: bookId, p_to_center_id: to, p_sticker_ids: picked })
        : await rpc("create_relocation", { p_book_id: bookId, p_from_center_id: from, p_to_center_id: to, p_sticker_ids: picked });
    if (r) {
      toast.success(`${picked.length} copies dispatched`);
      setPicked([]);
      void qc.invalidateQueries();
    }
  }

  async function accept(id: string) {
    if ((await rpc("accept_transfer", { p_transfer_id: id })) !== null) {
      toast.success("Transfer received — books added to inventory");
      void qc.invalidateQueries();
    }
  }

  return (
    <>
      <PageHeader title="Transfers" sub={isAdmin ? "Send university stock to centers or move idle books between centers" : "Books sent to and from your center"} />
      {isAdmin && (
        <Panel title="New transfer" className="mb-6">
          <div className="mb-4 flex gap-2">
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
                <Select value={from} onChange={(e) => { setFrom(e.target.value); setPicked([]); }}>
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
          </div>
          {bookId && (mode === "RESTOCK" || from) && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Pick copies ({picked.length} selected)</p>
              <StickerPicker copies={copies.data ?? []} picked={picked} setPicked={setPicked} />
            </div>
          )}
          <Btn onClick={send} className="mt-4">Dispatch</Btn>
          {mode === "RESTOCK" && <p className="mt-2 text-xs text-muted-foreground">Restocked books are added to the center's stock right away.</p>}
        </Panel>
      )}
      <Panel title="Transfer history">
        {list.data?.length ? (
          <Table head={["Date", "Book", "Type", "From", "To", "Qty", "Status", ""]}>
            {list.data.map((t: any) => {
              const canAccept = t.status === "DISPATCHED" && t.transfer_type === "IDLE_RELOCATION" && (isAdmin || t.to_center_id === staffProfile?.center_id);
              return (
                <tr key={t.id}>
                  <Td>{fmtDate(t.created_at)}</Td>
                  <Td className="font-medium">{t.master_books?.title}</Td>
                  <Td>{t.transfer_type === "RESTOCK" ? "Restock" : "Relocation"}</Td>
                  <Td>{t.from?.center_name ?? "University"}</Td>
                  <Td>{t.to?.center_name}</Td>
                  <Td>{t.quantity}</Td>
                  <Td><Tag tone={t.status === "RECEIVED" ? "green" : "amber"}>{t.status.toLowerCase()}</Tag></Td>
                  <Td>{canAccept && <Btn onClick={() => accept(t.id)}>Mark received</Btn>}</Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>No transfers yet.</Empty>}
      </Panel>
    </>
  );
}
