import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Table, Td, Tag, Empty, Crumbs, Select } from "@/components/kit";
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
  const copies = (q.data?.copies ?? []).filter((c: any) => !filter || c.status === filter);
  const title = q.data?.book?.title ?? "Book";

  return (
    <>
      <Crumbs items={[{ label: "Catalog", to: () => nav({ to: "/books" }) }, { label: title }]} />
      <PageHeader
        title={title}
        sub={`${q.data?.book?.author ?? ""} · ${q.data?.copies.length ?? 0} copies`}
        action={
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-auto">
            <option value="">All copies</option>
            {Object.entries(label).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        }
      />
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
