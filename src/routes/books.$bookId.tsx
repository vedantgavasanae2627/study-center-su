import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { rpc } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Table, Td, Tag, Empty, Crumbs, Select, Btn } from "@/components/kit";
import { db } from "@/lib/db";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/books/$bookId")({
  head: pageHead("Book Copies", "Every sticker ID of a book and where each copy is allocated."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN"]}>
      <BookCopies />
    </AppShell>
  ),
});

const label: Record<string, string> = { AVAILABLE: "At university", ALLOCATED_TO_CENTER: "At center", BORROWED: "Issued", IN_TRANSIT: "In transit" };
const tone: Record<string, string> = { AVAILABLE: "gray", ALLOCATED_TO_CENTER: "green", BORROWED: "amber", IN_TRANSIT: "gray" };

function BookCopies() {
  const { bookId } = Route.useParams();
  const nav = useNavigate();
  const [filter, setFilter] = useState("");
  const q = useQuery({
    queryKey: ["book-copies", bookId],
    queryFn: async () => {
      const [{ data: book }, { data: copies }] = await Promise.all([
        db.from("master_books").select("*").eq("id", bookId).maybeSingle(),
        db.from("book_copies").select("id,sticker_id,status,study_centers(center_name),students(full_name,prn)").eq("book_id", bookId).order("sticker_id"),
      ]);
      return { book, copies: copies ?? [] };
    },
  });
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string[]>([]);
  const atUni = (q.data?.copies ?? []).filter((c: any) => c.status === "AVAILABLE" && !c.study_centers);
  async function doDelete() {
    if (!pick.length) { toast.error("Select at least one sticker ID"); return; }
    const n = await rpc<number>("delete_book_copies", { p_book_id: bookId, p_sticker_ids: pick });
    if (n === null) return;
    toast.success(`Deleted ${n} copies`);
    setOpen(false); setPick([]);
    void qc.invalidateQueries();
    if (pick.length === (q.data?.copies.length ?? 0)) nav({ to: "/books" });
  }
  const copies = (q.data?.copies ?? []).filter((c: any) => !filter || c.status === filter);
  const title = q.data?.book?.title ?? "Book";

  return (
    <>
      <Crumbs items={[{ label: "Catalog", to: () => nav({ to: "/books" }) }, { label: title }]} />
      <PageHeader
        title={title}
        sub={`${q.data?.book?.author ?? ""} · ${q.data?.copies.length ?? 0} copies`}
        action={<div className="flex gap-2">
          <Btn variant="danger" onClick={() => { setPick([]); setOpen(true); }}>Delete copies</Btn>
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto">
            <option value="">All copies</option>
            {Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select></div>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete copies of {title}</DialogTitle>
            <DialogDescription>Only copies at the university can be deleted. Copies at centers or on loan are not listed.</DialogDescription>
          </DialogHeader>
          {atUni.length ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{pick.length} of {atUni.length} selected</span>
                <button className="font-medium text-primary" onClick={() => setPick(pick.length === atUni.length ? [] : atUni.map((c: any) => c.sticker_id))}>{pick.length === atUni.length ? "Clear" : "Select all"}</button>
              </div>
              <div className="flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                {atUni.map((c: any) => {
                  const on = pick.includes(c.sticker_id);
                  return <button key={c.id} onClick={() => setPick(on ? pick.filter((x) => x !== c.sticker_id) : [...pick, c.sticker_id])}
                    className={`rounded-md border px-2.5 py-1 font-mono text-xs ${on ? "border-destructive bg-destructive text-destructive-foreground" : "border-border bg-card text-foreground"}`}>{c.sticker_id}</button>;
                })}
              </div>
              <div className="flex justify-end gap-2">
                <Btn variant="outline" onClick={() => setOpen(false)}>Cancel</Btn>
                <Btn variant="danger" onClick={doDelete} disabled={!pick.length}>Delete {pick.length || ""}</Btn>
              </div>
            </>
          ) : <Empty>No copies at the university. Copies at centers can't be deleted.</Empty>}
        </DialogContent>
      </Dialog>
      <Panel title="Sticker IDs and allocation">
        {copies.length ? (
          <Table head={["Sticker ID", "Status", "Center", "Issued to"]}>
            {copies.map((c: any) => (
              <tr key={c.id}>
                <Td className="font-mono text-xs font-semibold">{c.sticker_id}</Td>
                <Td><Tag tone={tone[c.status] ?? "gray"}>{label[c.status] ?? c.status}</Tag></Td>
                <Td>{c.study_centers?.center_name ?? "University"}</Td>
                <Td>{c.students ? `${c.students.full_name} (${c.students.prn})` : "—"}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No copies.</Empty>}
      </Panel>
    </>
  );
}
