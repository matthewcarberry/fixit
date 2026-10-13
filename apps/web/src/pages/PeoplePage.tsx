import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import type { CreateUserInput, PublicUser, UpdateUserInput } from "@fixit/shared";
import { ErrorNote, Field, PageHeader, Spinner } from "../components/ui";
import { api, RequestError } from "../lib/api";
import { keys, useUsers } from "../lib/queries";

export function PeoplePage({ user: me }: { user: PublicUser }) {
  const users = useUsers();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to="/settings" className="inline-flex items-center gap-1 text-sm text-muted">
        <ArrowLeft className="size-4" aria-hidden /> Settings
      </Link>
      <PageHeader title="People" />
      <AddPerson />
      {users.isPending ? (
        <Spinner />
      ) : users.error ? (
        <ErrorNote error={users.error} />
      ) : (
        <ul className="space-y-2.5">
          {users.data.map((u) => (
            <PersonRow key={u.id} person={u} isMe={u.id === me.id} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AddPerson() {
  const queryClient = useQueryClient();
  const empty: CreateUserInput = { name: "", email: "", password: "", role: "requester" };
  const [form, setForm] = useState<CreateUserInput>(empty);
  const [open, setOpen] = useState(false);
  const add = useMutation({
    mutationFn: () => api.post<PublicUser>("/api/users", form),
    onSuccess: () => {
      setForm(empty);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: keys.users });
    },
  });
  const fields = add.error instanceof RequestError ? add.error.fields : {};

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        Add a person
      </button>
    );
  }
  return (
    <form
      className="card space-y-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <h2 className="font-semibold">Add a person</h2>
      <p className="text-sm text-muted">Give them their email and this starting password. They can change it in Settings.</p>
      <Field label="Name" htmlFor="new-name" error={fields.name}>
        <input id="new-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      </Field>
      <Field label="Email" htmlFor="new-email" error={fields.email}>
        <input id="new-email" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </Field>
      <Field label="Starting password" htmlFor="new-password" error={fields.password} hint="At least 10 characters.">
        <input id="new-password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
      </Field>
      <Field label="Role" htmlFor="new-role">
        <select id="new-role" className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as CreateUserInput["role"] })}>
          <option value="requester">Requester (submits tickets)</option>
          <option value="admin">Admin (works tickets)</option>
        </select>
      </Field>
      {!Object.keys(fields).length && <ErrorNote error={add.error} />}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={add.isPending}>
          Add
        </button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function PersonRow({ person, isMe }: { person: PublicUser; isMe: boolean }) {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [password, setPassword] = useState("");
  const update = useMutation({
    mutationFn: (input: UpdateUserInput) => api.patch<PublicUser>(`/api/users/${person.id}`, input),
    onSuccess: () => {
      setResetting(false);
      setPassword("");
      void queryClient.invalidateQueries({ queryKey: keys.users });
    },
  });
  const fields = update.error instanceof RequestError ? update.error.fields : {};

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">
            {person.name} {isMe && <span className="text-sm font-normal text-muted">(you)</span>}
          </p>
          <p className="text-sm text-muted">
            {person.email} · {person.role === "admin" ? "Admin" : "Requester"}
            {!person.active && " · Deactivated"}
          </p>
        </div>
        {!isMe && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary px-3 py-2" onClick={() => setResetting(!resetting)}>
              Reset password
            </button>
            <button
              className={person.active ? "btn-secondary px-3 py-2" : "btn-primary px-3 py-2"}
              onClick={() => update.mutate({ active: !person.active })}
              disabled={update.isPending}
            >
              {person.active ? "Deactivate" : "Reactivate"}
            </button>
          </div>
        )}
      </div>
      {resetting && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ password });
          }}
        >
          <div className="min-w-48 flex-1">
            <Field label="New password" htmlFor={`pw-${person.id}`} error={fields.password}>
              <input id={`pw-${person.id}`} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
          </div>
          <button className="btn-primary" disabled={update.isPending}>
            Set password
          </button>
        </form>
      )}
      {!fields.password && <ErrorNote error={update.error} />}
    </li>
  );
}
