import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import type { LoginInput, PublicUser } from "@fixit/shared";
import { AuthShell } from "../components/AuthShell";
import { ErrorNote, Field } from "../components/ui";
import { api } from "../lib/api";
import { passkeysSupported, signInWithPasskey } from "../lib/passkeys";
import { keys } from "../lib/queries";

export function LoginPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LoginInput>({ email: "", password: "" });
  const signedIn = (user: PublicUser | null) => {
    if (!user) return;
    // Drop anything cached for a previous person, keeping the app-level queries mounted.
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "info" });
    queryClient.setQueryData(keys.me, user);
  };
  const login = useMutation({
    mutationFn: async (input: LoginInput) => (await api.post<{ user: PublicUser }>("/api/auth/login", input)).user,
    onSuccess: signedIn,
  });
  const passkey = useMutation({ mutationFn: signInWithPasskey, onSuccess: signedIn });
  const [canUsePasskey] = useState(passkeysSupported);

  return (
    <AuthShell title="Sign in to Fixit" subtitle="Report anything around the house that needs fixing.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          passkey.reset();
          login.mutate(form);
        }}
      >
        <Field label="Email" htmlFor="email">
          <input id="email" type="email" className="input" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" type="password" className="input" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        <ErrorNote error={login.error ?? passkey.error} />
        <button className="btn-primary w-full" disabled={login.isPending || passkey.isPending}>
          {login.isPending ? "Signing in…" : "Sign in"}
        </button>
        {canUsePasskey && (
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={login.isPending || passkey.isPending}
            onClick={() => {
              login.reset();
              passkey.mutate();
            }}
          >
            <KeyRound className="size-4" aria-hidden />
            {passkey.isPending ? "Waiting for your passkey…" : "Sign in with a passkey"}
          </button>
        )}
        <p className="text-center text-xs text-muted">Forgot your password? Ask the admin to reset it.</p>
      </form>
    </AuthShell>
  );
}
