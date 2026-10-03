import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Field, TextInput, Btn, Table, Td, Empty } from "@/components/kit";
import { db, rpc, parseStickers } from "@/lib/db";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/books")({
  head: pageHead("Book Catalog", "University book catalog with copy counts and sticker IDs."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN"]}>
      <Books />
    </AppShell>
  ),
});

function Books() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [stickers, setStickers] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const books = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      const [{ data: b }, { data: c }] = await Promise.all([
        db.from("master_books").select("*").order("title"),
        db.from("book_copies").select("id,book_id,sticker_id,status,study_centers(center_name),students(full_name)"),
      ]);
      return (b ?? []).map((book: any) => {
        const copies = (c ?? []).filter((x: any) => x.book_id === book.id);
        return {
          ...book,
          copies,
          atUni: copies.filter((x: any) => x.status === "AVAILABLE").length,
          atCenters: copies.filter((x: any) => x.status === "ALLOCATED_TO_CENTER").length,
          borrowed: copies.filter((x: any) => x.status === "BORROWED").length,
          transit: copies.filter((x: any) => x.status === "IN_TRANSIT").length,
        };
      });
    },
  });

  async function add() {
    const ids = parseStickers(stickers);
    if (!title.trim() || !ids.length) return toast.error("Title and at least one sticker ID required");
    const r = await rpc("add_book_with_copies", { p_title: title.trim(), p_author: author.trim(), p_sticker_ids: ids });
    if (r) {
      toast.success(`Added ${ids.length} copies`);
      setTitle(""); setAuthor(""); setStickers("");
      void qc.invalidateQueries({ queryKey: ["catalog"] });
    }
  }

  const list = (books.data ?? []).filter((b: any) => `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <PageHeader title="Book Catalog" sub="Every title and physical copy owned by the university" />
      <Panel title="Add a book with copies" className="mb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Author"><TextInput value={author} onChange={(e) => setAuthor(e.target.value)} /></Field>
          <div className="sm:col-span-2">
            <Field label="Sticker IDs (comma or space separated)">
              <TextInput value={stickers} onChange={(e) => setStickers(e.target.value)} placeholder="BK-001, BK-002, BK-003" />
            </Field>
          </div>
        </div>
        <Btn onClick={add} className="mt-3">Add to catalog</Btn>
      </Panel>
      <Panel>
        <TextInput placeholder="Search title or author…" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-4" />
        {list.length ? (
          <Table head={["Title", "Author", "Total", "At university", "At centers", "On loan", "In transit"]}>
            {list.map((b: any) => (
              <>
                <tr key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpen(open === b.id ? null : b.id)}>
                  <Td className="font-medium">{b.title}</Td>
                  <Td>{b.author}</Td>
                  <Td>{b.copies.length}</Td>
                  <Td>{b.atUni}</Td>
                  <Td>{b.atCenters}</Td>
                  <Td>{b.borrowed}</Td>
                  <Td>{b.transit}</Td>
                </tr>
                {open === b.id && (
                  <tr key={b.id + "-c"}>
                    <td colSpan={7} className="bg-muted/40 px-3 py-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {b.copies.map((c: any) => (
                          <span key={c.id} className="rounded border border-border bg-card px-2 py-1 text-foreground">
                            <b>{c.sticker_id}</b> · {c.status.replaceAll("_", " ").toLowerCase()}
                            {c.study_centers?.center_name ? ` · ${c.study_centers.center_name}` : ""}
                            {c.students?.full_name ? ` · ${c.students.full_name}` : ""}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </Table>
        ) : <Empty>No books found.</Empty>}
        <p className="mt-3 text-xs text-muted-foreground">Tap a book to see each copy's sticker and location.</p>
      </Panel>
    </>
  );
}
