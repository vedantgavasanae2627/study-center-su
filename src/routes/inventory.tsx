import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell, useCenterScope } from "@/components/AppShell";
import { PageHeader, Panel, Table, Td, Tag, Empty } from "@/components/kit";
import { db, fmtDate } from "@/lib/db";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/inventory")({
  head: pageHead("Inventory", "Books held at each study center."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER"]}>
      <Inventory />
    </AppShell>
  ),
});

function Inventory() {
  const { centerId, picker } = useCenterScope();
  const inv = useQuery({
    queryKey: ["inventory", centerId],
    enabled: !!centerId,
    queryFn: async () => (await db.from("center_inventory").select("*, master_books(title,author)").eq("center_id", centerId)).data ?? [],
  });
  const list = [...(inv.data ?? [])].sort((a: any, b: any) => (a.master_books?.title ?? "").localeCompare(b.master_books?.title ?? ""));
  const total = list.reduce((s: number, i: any) => s + i.total_allocated, 0);
  const out = list.reduce((s: number, i: any) => s + i.currently_borrowed, 0);

  return (
    <>
      <PageHeader title="Inventory" sub={`${list.length} titles · ${total} copies · ${out} on loan`} action={picker} />
      <Panel>
        {list.length ? (
          <Table head={["Title", "Author", "Allocated", "Available", "On loan", "Last issued", ""]}>
            {list.map((i: any) => {
              const idle = !i.last_issued_date || Date.now() - new Date(i.last_issued_date).getTime() > 90 * 864e5;
              return (
                <tr key={i.id}>
                  <Td className="font-medium">{i.master_books?.title}</Td>
                  <Td>{i.master_books?.author}</Td>
                  <Td>{i.total_allocated}</Td>
                  <Td>{i.currently_available}</Td>
                  <Td>{i.currently_borrowed}</Td>
                  <Td>{fmtDate(i.last_issued_date)}</Td>
                  <Td>{i.currently_available === 0 ? <Tag tone="red">Out of stock</Tag> : idle ? <Tag tone="amber">Idle</Tag> : <Tag tone="green">Active</Tag>}</Td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty>No books at this center yet.</Empty>}
      </Panel>
    </>
  );
}
