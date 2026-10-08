import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, useCenters, roleLabels } from "@/components/AppShell";
import { PageHeader, Panel, Field, TextInput, Select, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { createAccount, resetUserPassword, deleteStaff } from "@/lib/accounts.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/staff")({
  head: pageHead("Staff", "Manage sub admins and study center coordinator logins."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN"]}>
      <Staff />
    </AppShell>
  ),
});

function Staff() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const centers = useCenters();
  const create = useServerFn(createAccount);
  const reset = useServerFn(resetUserPassword);
  const delStaff = useServerFn(deleteStaff);
  async function remove(u: any) {
    if (!confirm(`Delete the login for ${u.full_name}?`)) return;
    try { await delStaff({ data: { userId: u.id } }); toast.success("Login deleted"); void qc.invalidateQueries({ queryKey: ["staff"] }); }
    catch (e: any) { toast.error(e.message); }
  }
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "STUDY_CENTER", centerId: "" });
  const [busy, setBusy] = useState(false);

  const staff = useQuery({
    queryKey: ["staff"],
    queryFn: async () => {
      const [{ data: users }, { data: roles }] = await Promise.all([
        db.from("app_users").select("*, study_centers(center_name)").order("created_at"),
        db.from("user_roles").select("user_id,role"),
      ]);
      const rm = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
      return (users ?? []).map((u: any) => ({ ...u, role: rm.get(u.id) as keyof typeof roleLabels }));
    },
  });

  async function submit() {
    setBusy(true);
    try {
      await create({ data: { ...form, role: form.role as any, centerId: form.role === "STUDY_CENTER" ? form.centerId || undefined : undefined } });
      toast.success("Login created");
      setForm({ fullName: "", email: "", password: "", role: "STUDY_CENTER", centerId: "" });
      void qc.invalidateQueries({ queryKey: ["staff"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function doReset(id: string) {
    const pw = prompt("New password (min 8 characters)");
    if (!pw) return;
    try {
      await reset({ data: { userId: id, password: pw } });
      toast.success("Password updated");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const set = (k: string) => (e: any) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Staff" sub="Admins and study center coordinators" />
      <Panel title="Create a login" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name"><TextInput value={form.fullName} onChange={set("fullName")} /></Field>
          <Field label="Email"><TextInput type="email" value={form.email} onChange={set("email")} /></Field>
          <Field label="Password"><TextInput type="text" value={form.password} onChange={set("password")} placeholder="min 8 characters" /></Field>
          <Field label="Role">
            <Select value={form.role} onChange={set("role")}>
              <option value="STUDY_CENTER">Study Center coordinator</option>
              {role === "MAIN_ADMIN" && <option value="SUB_ADMIN">Sub Admin</option>}
            </Select>
          </Field>
          {form.role === "STUDY_CENTER" && (
            <Field label="Center">
              <Select value={form.centerId} onChange={set("centerId")}>
                <option value="">Select…</option>
                {centers.data?.map((c) => <option key={c.id} value={c.id}>{c.center_name}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex items-end"><Btn onClick={submit} disabled={busy} className="w-full">Create login</Btn></div>
        </div>
      </Panel>
      <Panel>
        {staff.data?.length ? (
          <Table head={["Name", "Email", "Role", "Center", ""]}>
            {staff.data.map((u: any) => (
              <tr key={u.id}>
                <Td className="font-medium">{u.full_name}</Td>
                <Td>{u.username_or_email}</Td>
                <Td><Tag tone={u.role === "STUDY_CENTER" ? "amber" : "green"}>{u.role ? roleLabels[u.role as keyof typeof roleLabels] : "—"}</Tag></Td>
                <Td>{u.study_centers?.center_name ?? "—"}</Td>
                <Td>{u.role !== "MAIN_ADMIN" && <div className="flex gap-2"><Btn variant="outline" onClick={() => doReset(u.id)}>Reset password</Btn>{(u.role === "STUDY_CENTER" || role === "MAIN_ADMIN") && <Btn variant="danger" onClick={() => remove(u)}>Delete</Btn>}</div>}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No staff yet.</Empty>}
      </Panel>
    </>
  );
}
