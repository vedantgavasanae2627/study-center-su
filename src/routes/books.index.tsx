import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, Field, TextInput, Btn, Table, Td, Empty, SortSelect, sortBooks, type SortKey } from "@/components/kit";
import { db, rpc, parseStickers } from "@/lib/db";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/books/")({
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
  const [sort, setSort] = useState<SortKey>("az");
  const nav = useNavigate();

  const books = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      const [{ data: b }, { data: c }, { data: d }] = await Promise.all([
        db.from("master_books").select("*").order("title"),
        db.from("book_copies").select("id,book_id,sticker_id,status,study_centers(center_name),students(full_name)"),
        db.from("book_donations").select("sticker_id"),
      ]);
      // Donated books belong to their center only, not the university catalog
      const donated = new Set((d ?? []).map((x: any) => x.sticker_id));
      return (b ?? []).map((book: any) => {
        const copies = (c ?? []).filter((x: any) => x.book_id === book.id && !donated.has(x.sticker_id));
        return {
          ...book,
          copies,
          atUni: copies.filter((x: any) => x.status === "AVAILABLE").length,
          atCenters: copies.filter((x: any) => x.status === "ALLOCATED_TO_CENTER").length,
          borrowed: copies.filter((x: any) => x.status === "BORROWED").length,
          transit: copies.filter((x: any) => x.status === "IN_TRANSIT").length,
        };
      }).filter((book: any) => book.copies.length > 0);
    },
  });

  async function add() {
    const ids = parseStickers(stickers);
    if (!title.trim() || !ids.length) { toast.error("Title and at least one sticker ID required"); return; }
    const r = await rpc("add_book_with_copies", { p_title: title.trim(), p_author: author.trim(), p_sticker_ids: ids });
    if (r) {
      toast.success(`Added ${ids.length} copies`);
      setTitle(""); setAuthor(""); setStickers("");
      void qc.invalidateQueries({ queryKey: ["catalog"] });
    }
  }

  const list = sortBooks((books.data ?? []).filter((b: any) => `${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase())), sort, (b: any) => b.title, (b: any) => b.copies.length);

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
        <div className="mb-4 flex flex-wrap gap-2">
          <TextInput placeholder="Search title or author…" value={search} onChange={(e) => setSearch(e.target.value)} className="min-w-0 flex-1" />
          <SortSelect value={sort} onChange={setSort} />
        </div>
        {list.length ? (
          <Table head={["Title", "Author", "Total", "At university", "At centers", "On loan", "In transit"]}>
            {list.map((b: any) => (
              <tr key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => nav({ to: "/books/$bookId", params: { bookId: b.id } })}>
                <Td className="font-medium">{b.title}</Td>
                <Td>{b.author}</Td>
                <Td>{b.copies.length}</Td>
                <Td>{b.atUni}</Td>
                <Td>{b.atCenters}</Td>
                <Td>{b.borrowed}</Td>
                <Td>{b.transit}</Td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No books found.</Empty>}
        <p className="mt-3 text-xs text-muted-foreground">Tap a book to see its sticker IDs and where each copy is.</p>
      </Panel>
    </>
  );
}
