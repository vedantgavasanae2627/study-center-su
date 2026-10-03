import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AppShell, useCenters } from "@/components/AppShell";
import { PageHeader, Panel, Field, TextInput, Btn, Table, Td, Empty } from "@/components/kit";
import { db } from "@/lib/db";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/centers")({
  head: pageHead("Study Centers", "Manage study centers and their locations."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN"]}>
      <Centers />
    </AppShell>
  ),
});

function Centers() {
  const qc = useQueryClient();
  const centers = useCenters();
  const [name, setName] = useState("");
  const [loc, setLoc] = useState("");
  const counts = useQuery({
    queryKey: ["center-counts"],
    queryFn: async () => {
      const [{ data: st }, { data: inv }, { data: staff }] = await Promise.all([
        db.from("students").select("center_id"),
        db.from("center_inventory").select("center_id,total_allocated,currently_borrowed"),
        db.from("app_users").select("center_id,username_or_email").not("center_id", "is", null),
      ]);
      const m: Record<string, { students: number; copies: number; out: number; logins: string[] }> = {};
      const g = (id: string) => (m[id] ??= { students: 0, copies: 0, out: 0, logins: [] });
      st?.forEach((s: any) => g(s.center_id).students++);
      inv?.forEach((i: any) => { g(i.center_id).copies += i.total_allocated; g(i.center_id).out += i.currently_borrowed; });
      staff?.forEach((s: any) => g(s.center_id).logins.push(s.username_or_email));
      return m;
    },
  });

  async function add() {
    if (!name.trim() || !loc.trim()) { toast.error("Enter name and location"); return; }
    const { error } = await db.from("study_centers").insert({ center_name: name.trim(), location: loc.trim() });
    if (error) { toast.error(error.message); return; }
    toast.success("Center added");
    setName(""); setLoc("");
    void qc.invalidateQueries({ queryKey: ["centers"] });
  }

  async function remove(id: string) {
    if (!confirm("Delete this center? Only possible if it has no students.")) return;
    const { error } = await db.from("study_centers").delete().eq("id", id);
    if (error) { toast.error("Can't delete: center still has students or history"); return; }
    toast.success("Center deleted");
    void qc.invalidateQueries({ queryKey: ["centers"] });
  }

  return (
    <>
      <PageHeader title="Study Centers" sub="All centers under the university book bank" />
      <Panel title="Add a center" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Center name"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ichalkaranji Study Center" /></Field>
          <Field label="Location"><TextInput value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Ichalkaranji" /></Field>
          <Btn onClick={add}>Add center</Btn>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Create a login for the center's coordinator on the Staff page.</p>
      </Panel>
      <Panel>
        {centers.data?.length ? (
          <Table head={["Center", "Location", "Students", "Copies", "On loan", "Logins", ""]}>
            {centers.data.map((c) => {
              const k = counts.data?.[c.id];
              return (
                <tr key={c.id}>
                  <Td className="font-medium">{c.center_name}</Td>
                  <Td>{c.location}</Td>
                  <Td>{k?.students ?? 0}</Td>
                  <Td>{k?.copies ?? 0}</Td>
                  <Td>{k?.out ?? 0}</Td>
                  <Td className="text-xs text-muted-foreground">{k?.logins.join(", ") || "—"}</Td>
                  <Td><Btn variant="ghost" onClick={() => remove(c.id)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Btn></Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>No centers yet.</Empty>}
      </Panel>
    </>
  );
}
