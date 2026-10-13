import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LoginInput, PublicUser } from "@fixit/shared";
import { AuthShell } from "../components/AuthShell";
import { ErrorNote, Field } from "../components/ui";
import { api } from "../lib/api";
import { keys } from "../lib/queries";

export function LoginPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });
  const login = useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: PublicUser }>("/api/auth/login", input),
    onSuccess: ({ user }) => {
      // Drop anything cached for a previous person, keeping the app-level queries mounted.
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "info" });
      queryClient.setQueryData(keys.me, user);
    },
  });

  return (
    <AuthShell title="Sign in to Fixit" subtitle="Report anything around the house that needs fixing.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate(form);
        }}
      >
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" className="input" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" className="input" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        <ErrorNote error={login.error} />
        <button className="btn-primary w-full" disabled={login.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-center text-xs text-muted">Forgot your password? Ask the admin to reset it.</p>
      </form>
    </AuthShell>
  );
}
