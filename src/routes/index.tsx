import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BookOpen, Building2, ArrowLeftRight, GraduationCap } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shivaji University Study Centers — Book Bank" },
      {
        name: "description",
        content:
          "Manage book distribution across Shivaji University study centers: issue, return, renew, transfer and track every book copy.",
      },
      { property: "og:title", content: "Shivaji University Study Centers — Book Bank" },
      {
        property: "og:description",
        content:
          "Manage book distribution across Shivaji University study centers: issue, return, renew, transfer and track every book copy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const features = [
  {
    icon: BookOpen,
    title: "Book Circulation",
    text: "Issue, return and renew books with automatic due dates and late fines.",
  },
  {
    icon: Building2,
    title: "40 Study Centers",
    text: "Each center manages its own students, stock and daily transactions.",
  },
  {
    icon: ArrowLeftRight,
    title: "Stock Transfers",
    text: "Restock centers and move idle books where they are needed most.",
  },
  {
    icon: GraduationCap,
    title: "Student Portal",
    text: "Students see their borrowed books, due dates and fines anytime.",
  },
];

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) {
      void navigate({ to: "/dashboard" });
    }
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <span className="font-semibold text-foreground">
              Shivaji University Book Bank
            </span>
          </div>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Every book, every center, one system
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            The study center management system for Shivaji University's book
            bank — track every copy by sticker, from university stock to a
            student's hands and back.
          </p>
          <div className="mt-8">
            <Link
              to="/auth"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in to your account
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-card p-6"
            >
              <f.icon className="h-8 w-8 text-primary" />
              <h2 className="mt-3 text-lg font-semibold text-card-foreground">
                {f.title}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
