import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { PublicUser, SetupInput } from "@fixit/shared";
import { AuthShell } from "../components/AuthShell";
import { ErrorNote, Field } from "../components/ui";
import { api, RequestError } from "../lib/api";
import { keys } from "../lib/queries";

export function SetupPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SetupInput>({ name: "", email: "", password: "" });
  const setup = useMutation({
    mutationFn: (input: SetupInput) => api.post<{ user: PublicUser }>("/api/setup", input),
    onSuccess: ({ user }) => {
      queryClient.setQueryData(keys.me, user);
      void queryClient.invalidateQueries({ queryKey: keys.info });
    },
  });
  const fields = setup.error instanceof RequestError ? setup.error.fields : {};

  return (
    <AuthShell title="Welcome to Fixit" subtitle="Create the admin account. That's you: the person who fixes things.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setup.mutate(form);
        }}
      >
        <Field label="Your name" htmlFor="name" error={fields.name}>
          <input id="name" className="input" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Email" htmlFor="email" error={fields.email}>
          <input id="email" type="email" className="input" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field label="Password" htmlFor="password" error={fields.password} hint="At least 10 characters.">
          <input id="password" type="password" className="input" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </Field>
        {!Object.keys(fields).length && <ErrorNote error={setup.error} />}
        <button className="btn-primary w-full" disabled={setup.isPending}>
          {setup.isPending ? "Creating…" : "Create admin account"}
        </button>
      </form>
    </AuthShell>
  );
}
