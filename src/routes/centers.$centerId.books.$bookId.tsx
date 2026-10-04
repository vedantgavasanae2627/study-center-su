import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Table, Td, Tag, Empty, Crumbs } from "@/components/kit";
import { db, fmtDate } from "@/lib/db";
import { pageHead } from "@/lib/seo";
import { useCenter } from "./centers.$centerId.index";

export const Route = createFileRoute("/centers/$centerId/books/$bookId")({
  head: pageHead("Center Book Copies", "Sticker IDs of a book at a study center and who holds each copy."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN"]}>
      <CenterBook />
    </AppShell>
  ),
});

const tone: Record<string, string> = { BORROWED: "amber", ALLOCATED_TO_CENTER: "green", IN_TRANSIT: "gray" };
const label: Record<string, string> = { BORROWED: "Issued", ALLOCATED_TO_CENTER: "Available", IN_TRANSIT: "In transit" };

function CenterBook() {
  const { centerId, bookId } = Route.useParams();
  const nav = useNavigate();
  const center = useCenter(centerId);
  const q = useQuery({
    queryKey: ["center-book", centerId, bookId],
    queryFn: async () => {
      const [{ data: book }, { data: copies }, { data: tx }] = await Promise.all([
        db.from("master_books").select("*").eq("id", bookId).maybeSingle(),
        db.from("book_copies").select("id,sticker_id,status,students(full_name,prn)").eq("book_id", bookId).eq("current_center_id", centerId).order("sticker_id"),
        db.from("student_transactions").select("copy_id,issue_date,due_date").eq("book_id", bookId).eq("center_id", centerId).neq("status", "RETURNED"),
      ]);
      const loan: Record<string, any> = {};
      tx?.forEach((t: any) => t.copy_id && (loan[t.copy_id] = t));
      return { book, copies: (copies ?? []).map((c: any) => ({ ...c, loan: loan[c.id] })) };
    },
  });
  const cname = center.data?.center_name ?? "Center";
  const title = q.data?.book?.title ?? "Book";

  return (
    <>
      <Crumbs items={[
        { label: "Centers", to: () => nav({ to: "/centers" }) },
        { label: cname, to: () => nav({ to: "/centers/$centerId", params: { centerId } }) },
        { label: title },
      ]} />
      <PageHeader title={title} sub={`${q.data?.book?.author ?? ""} · ${q.data?.copies.length ?? 0} copies at ${cname}`} />
      <Panel title="Copies and allocation">
        {q.data?.copies.length ? (
          <Table head={["Sticker ID", "Status", "Issued to", "PRN", "Issued on", "Due"]}>
            {q.data.copies.map((c: any) => (
              <tr key={c.id}>
                <Td className="font-mono text-xs font-semibold">{c.sticker_id}</Td>
                <Td><Tag tone={tone[c.status] ?? "gray"}>{label[c.status] ?? c.status}</Tag></Td>
                <Td>{c.students?.full_name ?? "—"}</Td>
                <Td>{c.students?.prn ?? "—"}</Td>
                <Td>{fmtDate(c.loan?.issue_date)}</Td>
                <Td>{fmtDate(c.loan?.due_date)}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No copies of this book at this center.</Empty>}
      </Panel>
    </>
  );
}
