import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell, roleLabels } from "@/components/AppShell";
import { PageHeader, Panel, Field, TextInput, Btn } from "@/components/kit";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/account")({
  head: pageHead("Account", "Your profile and password."),
  component: () => (
    <AppShell roles={["MAIN_ADMIN", "SUB_ADMIN", "STUDY_CENTER", "STUDENT"]}>
      <Account />
    </AppShell>
  ),
});

function Account() {
  const { session, role, staffProfile, studentRecord } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  async function change() {
    if (pw.length < 8) { toast.error("Use at least 8 characters"); return; }
    if (pw !== pw2) { toast.error("Passwords don't match"); return; }
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) { toast.error(error.message); return; }
    toast.success("Password changed");
    setPw(""); setPw2("");
  }

  return (
    <>
      <PageHeader title="Account" />
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Profile">
          <dl className="space-y-2 text-sm">
            <div><dt className="text-muted-foreground">Name</dt><dd className="text-foreground">{studentRecord?.full_name ?? staffProfile?.full_name}</dd></div>
            <div><dt className="text-muted-foreground">Email</dt><dd className="text-foreground">{session?.user.email}</dd></div>
            <div><dt className="text-muted-foreground">Role</dt><dd className="text-foreground">{role ? roleLabels[role] : "—"}</dd></div>
            {studentRecord?.student_id && <div><dt className="text-muted-foreground">Student ID</dt><dd className="font-mono text-foreground">{studentRecord.student_id}</dd></div>}
          </dl>
        </Panel>
        <Panel title="Change password">
          <div className="space-y-3">
            <Field label="New password"><TextInput type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="Confirm"><TextInput type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <Btn onClick={change}>Update password</Btn>
          </div>
        </Panel>
      </div>
    </>
  );
}
