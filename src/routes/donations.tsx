import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell, useCenterScope } from "@/components/AppShell";
import { PageHeader, Panel, Field, Select, TextInput, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db, fmtDate } from "@/lib/db";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/donations")({
  head: pageHead("Donations", "Record books donated by students kept separately from the main catalog."),
  component: () => (
    <AppShell roles={["STUDY_CENTER"]}>
      <Donations />
    </AppShell>
  ),
});

const blank = { prn: "", book_name: "", author: "", sticker_id: "", condition: "Good" };

function Donations() {
  const qc = useQueryClient();
  const { centerId, picker } = useCenterScope();
  const [f, setF] = useState(blank);
  const list = useQuery({
    queryKey: ["donations", centerId],
    enabled: !!centerId,
    queryFn: async () => (await db.from("book_donations").select("*, students(full_name)").eq("center_id", centerId).order("created_at", { ascending: false })).data ?? [],
  });
  const set = (k: keyof typeof blank) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function add() {
    if (!f.book_name || !f.sticker_id) { toast.error("Book name and sticker ID required"); return; }
    let student_id = null;
    if (f.prn) {
      const { data } = await db.from("students").select("id").eq("prn", f.prn).maybeSingle();
      student_id = data?.id ?? null;
    }
    const { error } = await db.from("book_donations").insert({ ...f, center_id: centerId, student_id });
    if (error) { toast.error(error.message); return; }
    toast.success("Donation recorded");
    setF(blank);
    void qc.invalidateQueries({ queryKey: ["donations"] });
  }
  return (
    <>
      <PageHeader title="Donations" sub="Books donated by students" action={picker} />
      <Panel title="Record a donation" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label="Book name"><TextInput value={f.book_name} onChange={set("book_name")} /></Field>
          <Field label="Author"><TextInput value={f.author} onChange={set("author")} /></Field>
          <Field label="Sticker ID"><TextInput value={f.sticker_id} onChange={set("sticker_id")} /></Field>
          <Field label="Donor PRN (optional)"><TextInput value={f.prn} onChange={set("prn")} /></Field>
          <Field label="Condition">
            <Select value={f.condition} onChange={set("condition")}>{["New", "Good", "Fair", "Poor"].map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
        </div>
        <Btn onClick={add} className="mt-3" disabled={!centerId}>Record donation</Btn>
      </Panel>
      <Panel>
        {list.data?.length ? (
          <Table head={["Date", "Book", "Sticker", "Donor", "Condition", "Status"]}>
            {list.data.map((d: any) => (
              <tr key={d.id}>
                <Td>{fmtDate(d.created_at)}</Td>
                <Td className="font-medium">{d.book_name}<span className="block text-xs text-muted-foreground">{d.author}</span></Td>
                <Td className="font-mono text-xs">{d.sticker_id}</Td>
                <Td>{d.students?.full_name ?? (d.prn || "—")}</Td>
                <Td>{d.condition}</Td>
                <Td><Tag tone="green">Donated</Tag></Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No donations recorded.</Empty>}
      </Panel>
    </>
  );
}
