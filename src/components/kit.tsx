import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 sm:p-5", className)}>
      {title && <h2 className="mb-4 text-base font-semibold text-card-foreground">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const ctl =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

export function TextInput(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cn(ctl, p.className)} />;
}

export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cn(ctl, p.className)} />;
}

export function Btn({
  variant = "primary",
  className,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "danger" | "ghost" }) {
  const v = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    outline: "border border-border bg-background text-foreground hover:bg-accent",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    ghost: "text-foreground hover:bg-accent",
  }[variant];
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        v,
        className,
      )}
    />
  );
}

const tones: Record<string, string> = {
  green: "bg-accent text-accent-foreground",
  amber: "bg-secondary text-secondary-foreground",
  red: "bg-destructive/10 text-destructive",
  gray: "bg-muted text-muted-foreground",
};

export function Tag({ tone = "gray", children }: { tone?: keyof typeof tones | string; children: ReactNode }) {
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tones[tone] ?? tones["gray"])}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-middle text-foreground", className)}>{children}</td>;
}

export type SortKey = "az" | "za" | "qty-asc" | "qty-desc";

export function SortSelect({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as SortKey)} className="w-auto" aria-label="Sort">
      <option value="az">Title A–Z</option>
      <option value="za">Title Z–A</option>
      <option value="qty-asc">Quantity: low to high</option>
      <option value="qty-desc">Quantity: high to low</option>
    </Select>
  );
}

export function sortBooks<T>(list: T[], key: SortKey, name: (x: T) => string, qty: (x: T) => number): T[] {
  return [...list].sort((a, b) => {
    if (key === "az") return name(a).localeCompare(name(b));
    if (key === "za") return name(b).localeCompare(name(a));
    if (key === "qty-asc") return qty(a) - qty(b) || name(a).localeCompare(name(b));
    return qty(b) - qty(a) || name(a).localeCompare(name(b));
  });
}

export function Crumbs({ items }: { items: { label: string; to?: () => void }[] }) {
  return (
    <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden>›</span>}
          {it.to ? (
            <button onClick={it.to} className="hover:text-foreground hover:underline">{it.label}</button>
          ) : (
            <span className="font-medium text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
