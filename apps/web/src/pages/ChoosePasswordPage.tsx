import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PublicUser } from "@fixit/shared";
import { AuthShell } from "../components/AuthShell";
import { ErrorNote, Field } from "../components/ui";
import { api, RequestError } from "../lib/api";
import { keys } from "../lib/queries";

/** Shown after signing in with a password the admin chose, until the person picks their own. */
export function ChoosePasswordPage({ user }: { user: PublicUser }) {
  const queryClient = useQueryClient();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation({
    mutationFn: () => api.post<{ user: PublicUser }>("/api/auth/password", { currentPassword, newPassword }),
    onSuccess: ({ user }) => queryClient.setQueryData(keys.me, user),
  });
  const signOut = useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => queryClient.setQueryData(keys.me, null),
  });
  const fields = change.error instanceof RequestError ? change.error.fields : {};

  return (
    <AuthShell title="Choose your password" subtitle={`Welcome, ${user.name}. Pick a password only you know before you start.`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setMismatch(newPassword !== confirm);
          if (newPassword === confirm) change.mutate();
        }}
      >
        <Field label="Password you were given" htmlFor="current">
          <input id="current" type="password" className="input" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" htmlFor="new" error={fields.newPassword} hint="At least 10 characters.">
          <input id="new" type="password" className="input" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required />
        </Field>
        <Field label="Type it again" htmlFor="confirm" error={mismatch ? "The two passwords don't match" : undefined}>
          <input id="confirm" type="password" className="input" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        {!fields.newPassword && <ErrorNote error={change.error} />}
        <button className="btn-primary w-full" disabled={change.isPending}>
          {change.isPending ? "Saving…" : "Save and continue"}
        </button>
        <button type="button" className="w-full text-center text-xs text-muted" onClick={() => signOut.mutate()}>
          Sign out
        </button>
      </form>
    </AuthShell>
  );
}
