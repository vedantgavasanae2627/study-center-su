import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(120),
  role: z.enum(["SUB_ADMIN", "STUDY_CENTER", "STUDENT"]),
  centerId: z.string().uuid().optional(),
  studentId: z.string().uuid().optional(),
});

export const createAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", context.userId);
    const mine = (roles ?? []).map((r: any) => r.role as string);
    const isMain = mine.includes("MAIN_ADMIN");
    const isAdmin = isMain || mine.includes("SUB_ADMIN");
    const isCenter = mine.includes("STUDY_CENTER");

    if (data.role === "SUB_ADMIN" && !isMain) throw new Error("Only the Main Admin can add sub admins");
    if (data.role === "STUDY_CENTER" && !isAdmin) throw new Error("Only admins can add center logins");
    if (data.role === "STUDY_CENTER" && !data.centerId) throw new Error("Pick a study center");
    if (data.role === "STUDENT") {
      if (!isAdmin && !isCenter) throw new Error("Not authorized");
      if (!data.studentId) throw new Error("Missing student");
      // RLS ensures centers can only see their own students
      const { data: st } = await sb.from("students").select("id,user_id").eq("id", data.studentId).maybeSingle();
      if (!st) throw new Error("Student not found");
      if (st.user_id) throw new Error("Student already has a login");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (error) throw new Error(error.message);
    const uid = created.user.id;
    const { error: rErr } = await admin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (rErr) throw new Error(rErr.message);
    if (data.role === "STUDENT") {
      const { error: e } = await admin.from("students").update({ user_id: uid, email: data.email }).eq("id", data.studentId);
      if (e) throw new Error(e.message);
    } else {
      const { error: e } = await admin.from("app_users").insert({
        id: uid,
        username_or_email: data.email,
        full_name: data.fullName,
        center_id: data.role === "STUDY_CENTER" ? data.centerId : null,
      });
      if (e) throw new Error(e.message);
    }
    return { userId: uid };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "MAIN_ADMIN" || r.role === "SUB_ADMIN");
    if (!isAdmin) throw new Error("Only admins can reset passwords");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await (supabaseAdmin as any).from("user_roles").select("role").eq("user_id", data.userId);
    if ((target ?? []).some((r: any) => r.role === "MAIN_ADMIN")) throw new Error("Cannot reset the Main Admin");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
