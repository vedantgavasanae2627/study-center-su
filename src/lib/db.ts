import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Untyped handle: generated types may lag behind the schema.
export const db = supabase as any;

export async function rpc<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T | null> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    toast.error(error.message);
    return null;
  }
  return data as T;
}

export async function q<T = any>(promise: PromiseLike<{ data: T | null; error: any }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return (data ?? []) as T;
}

export const FINE_PER_DAY = 5;

export function fmtDate(d?: string | null) {
  return d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

export function overdueFine(due: string) {
  const days = Math.floor((Date.now() - new Date(due).getTime()) / 864e5);
  return days > 0 ? days * FINE_PER_DAY : 0;
}

export function parseStickers(s: string) {
  return s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
}
