import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell, useCenterScope } from "@/components/AppShell";
import { PageHeader, Panel, Field, TextInput, Select, Btn, Table, Td, Tag, Empty } from "@/components/kit";
import { db, rpc } from "@/lib/db";
import { createAccount } from "@/lib/accounts.functions";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/students")({
  head: pageHead("Students", "Register and manage students at your study center."),
  component: () => (
    <AppShell roles={["STUDY_CENTER"]}>
      <Students />
    </AppShell>
  ),
});

const COURSES = ["BA", "BCOM", "BSC", "BCA", "BBA", "MA", "MCOM", "MSC"];
const blank = { prn: "", full_name: "", course: "BA", enrollment_year: String(new Date().getFullYear()), year_of_study: "1", semester: "1", college_name: "", branch: "", phone: "", email: "" };

function Students() {
  const qc = useQueryClient();
  const { centerId, picker } = useCenterScope();
  const create = useServerFn(createAccount);
  const [f, setF] = useState(blank);
  const [search, setSearch] = useState("");

  const students = useQuery({
    queryKey: ["students", centerId],
    enabled: !!centerId,
    queryFn: async () => {
      const [{ data: s }, { data: tx }] = await Promise.all([
        db.from("students").select("*").eq("center_id", centerId).order("created_at", { ascending: false }),
        db.from("student_transactions").select("student_id").eq("center_id", centerId).neq("status", "RETURNED"),
      ]);
      const loans: Record<string, number> = {};
      tx?.forEach((t: any) => (loans[t.student_id] = (loans[t.student_id] ?? 0) + 1));
      return (s ?? []).map((x: any) => ({ ...x, loans: loans[x.id] ?? 0 }));
    },
  });

  async function add() {
    if (!f.prn || !f.full_name) { toast.error("PRN and name are required"); return; }
    const id = await rpc("add_student", {
      p_prn: f.prn, p_full_name: f.full_name, p_enrollment_year: Number(f.enrollment_year), p_course: f.course,
      p_year_of_study: Number(f.year_of_study), p_college_name: f.college_name, p_branch: f.branch || f.course,
      p_semester: Number(f.semester), p_phone: f.phone || null, p_email: f.email || null, p_center_id: centerId,
    });
    if (id) {
      toast.success("Student registered");
      setF(blank);
      void qc.invalidateQueries({ queryKey: ["students"] });
    }
  }

  async function makeLogin(s: any) {
    const email = prompt("Login email for the student", s.email ?? "");
    if (!email) return;
    const password = prompt("Password (min 8 characters)");
    if (!password) return;
    try {
      await create({ data: { email, password, fullName: s.full_name, role: "STUDENT", studentId: s.id } });
      toast.success("Student login created");
      void qc.invalidateQueries({ queryKey: ["students"] });
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const set = (k: keyof typeof blank) => (e: any) => setF({ ...f, [k]: e.target.value });
  const list = (students.data ?? []).filter((s: any) => `${s.full_name} ${s.prn} ${s.student_id}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader title="Students" sub="Student ID is generated automatically from year and course" action={picker} />
      <Panel title="Register a student" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="PRN"><TextInput value={f.prn} onChange={set("prn")} /></Field>
          <Field label="Full name"><TextInput value={f.full_name} onChange={set("full_name")} /></Field>
          <Field label="Course"><Select value={f.course} onChange={set("course")}>{COURSES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Enrollment year"><TextInput type="number" value={f.enrollment_year} onChange={set("enrollment_year")} /></Field>
          <Field label="Year of study"><Select value={f.year_of_study} onChange={set("year_of_study")}>{[1, 2, 3].map((y) => <option key={y}>{y}</option>)}</Select></Field>
          <Field label="Semester"><Select value={f.semester} onChange={set("semester")}>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y}>{y}</option>)}</Select></Field>
          <Field label="College"><TextInput value={f.college_name} onChange={set("college_name")} /></Field>
          <Field label="Phone"><TextInput value={f.phone} onChange={set("phone")} /></Field>
          <Field label="Email"><TextInput type="email" value={f.email} onChange={set("email")} /></Field>
        </div>
        <Btn onClick={add} className="mt-3" disabled={!centerId}>Register student</Btn>
      </Panel>
      <Panel>
        <TextInput placeholder="Search name, PRN or ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4" />
        {list.length ? (
          <Table head={["Student ID", "Name", "PRN", "Course", "Year", "Phone", "Books out", "Login"]}>
            {list.map((s: any) => (
              <tr key={s.id}>
                <Td className="font-mono text-xs">{s.student_id}</Td>
                <Td className="font-medium">{s.full_name}</Td>
                <Td>{s.prn}</Td>
                <Td>{s.course}</Td>
                <Td>{s.year_of_study}</Td>
                <Td>{s.phone ?? "—"}</Td>
                <Td>{s.loans}</Td>
                <Td>{s.user_id ? <Tag tone="green">Active</Tag> : <Btn variant="outline" onClick={() => makeLogin(s)}>Create login</Btn>}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No students at this center yet.</Empty>}
      </Panel>
    </>
  );
}
