import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, useCenter } from "@/components/AppShell";
import { PageHeader, Panel, Table, Td, Tag, Empty, Crumbs } from "@/components/kit";
import { db, fmtDate, overdueFine } from "@/lib/db";
import { pageHead } from "@/lib/seo";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/students/$studentId")({
  head: pageHead("Student Details", "Student profile and book issue history."),
  component: () => (
    <AppShell roles={["STUDY_CENTER"]}>
      <StudentDetail />
    </AppShell>
  ),
});

function StudentDetail() {
  const { studentId } = Route.useParams();
  const { staffProfile } = useAuth();
  const centerId = staffProfile?.center_id ?? "";
  const nav = useNavigate();
  const center = useCenter(centerId);
  const q = useQuery({
    queryKey: ["student-detail", studentId],
    queryFn: async () => {
      const [{ data: s }, { data: tx }] = await Promise.all([
        db.from("students").select("*").eq("id", studentId).maybeSingle(),
        db.from("student_transactions").select("*, master_books(title,author), book_copies(sticker_id)").eq("student_id", studentId).order("issue_date", { ascending: false }),
      ]);
      return { s, tx: tx ?? [] };
    },
  });
  const s = q.data?.s;
  const cname = center.data?.center_name ?? "Center";
  const info: [string, any][] = s ? [
    ["Student ID", s.student_id], ["PRN", s.prn], ["Course", s.course], ["Branch", s.branch],
    ["Year of study", s.year_of_study], ["Semester", s.semester], ["Enrollment year", s.enrollment_year],
    ["College", s.college_name], ["Phone", s.phone], ["Email", s.email], ["Login", s.user_id ? "Active" : "Not created"],
  ] : [];

  return (
    <>
      <Crumbs items={[
        { label: "Students", to: () => nav({ to: "/students" }) },
        { label: s?.full_name ?? "Student" },
      ]} />
      <PageHeader title={s?.full_name ?? "Student"} sub={cname} />
      <Panel title="Student information" className="mb-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {info.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="text-sm font-medium text-foreground break-words">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <Panel title="Book issue history">
        {q.data?.tx.length ? (
          <Table head={["Book", "Sticker", "Issued", "Due", "Returned", "Status", "Fine"]}>
            {q.data.tx.map((t: any) => {
              const fine = t.status === "RETURNED" ? t.fine_amount : overdueFine(t.due_date);
              return (
                <tr key={t.id}>
                  <Td className="font-medium">{t.master_books?.title}<span className="block text-xs text-muted-foreground">{t.master_books?.author}</span></Td>
                  <Td className="font-mono text-xs">{t.book_copies?.sticker_id ?? "—"}</Td>
                  <Td>{fmtDate(t.issue_date)}</Td>
                  <Td>{fmtDate(t.due_date)}</Td>
                  <Td>{fmtDate(t.return_date)}</Td>
                  <Td><Tag tone={t.status === "RETURNED" ? "gray" : fine > 0 ? "red" : "green"}>{t.status === "RETURNED" ? "Returned" : fine > 0 ? "Overdue" : t.status === "RENEWED" ? "Renewed" : "Issued"}</Tag></Td>
                  <Td>{fine ? `₹${fine}` : "—"}</Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>No books issued yet.</Empty>}
      </Panel>
    </>
  );
}
