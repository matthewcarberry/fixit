import { useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import type { CreatedUser, CreateUserInput, PublicUser, UpdateUserInput } from "@fixit/shared";
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
  const [added, setAdded] = useState<(CreatedUser & { password: string }) | null>(null);
  const add = useMutation({
    mutationFn: () => api.post<CreatedUser>("/api/users", form),
    onSuccess: (result) => {
      setAdded({ ...result, password: form.password });
      setForm(empty);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: keys.users });
    },
  });
  const fields = add.error instanceof RequestError ? add.error.fields : {};

  if (!open) {
    return (
      <div className="space-y-3">
        {added && <AddedNotice added={added} onDismiss={() => setAdded(null)} />}
        <button
          className="btn-primary"
          onClick={() => {
            setAdded(null);
            setOpen(true);
          }}
        >
          Add a person
        </button>
      </div>
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
      <p className="text-sm text-muted">They'll be asked to choose their own password the first time they sign in.</p>
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

function AddedNotice({ added, onDismiss }: { added: CreatedUser & { password: string }; onDismiss: () => void }) {
  const { user, welcomeEmail, password } = added;
  const address = window.location.origin;
  return (
    <div role="status" className="card space-y-2 p-4 text-sm">
      {welcomeEmail === "sent" ? (
        <p>
          <span className="font-semibold">{user.name} was added.</span> We emailed {user.email} their sign-in details.
        </p>
      ) : (
        <>
          <p>
            <span className="font-semibold">{user.name} was added, but no email was sent</span>{" "}
            {welcomeEmail === "failed" ? "because the mail server didn't accept it." : "because email isn't set up."}{" "}
            Share these sign-in details with them yourself:
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-surface-2 p-3">
            <dt className="text-muted">Address</dt>
            <dd className="break-all">{address}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all">{user.email}</dd>
            <dt className="text-muted">Password</dt>
            <dd className="break-all">{password}</dd>
          </dl>
        </>
      )}
      <p className="text-muted">They'll choose their own password the first time they sign in.</p>
      <button className="text-sm font-medium underline" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

function PersonRow({ person, isMe }: { person: PublicUser; isMe: boolean }) {
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
            <button className="btn-secondary px-3 py-2 text-red-700 dark:text-red-400" onClick={() => setDeleting(!deleting)}>
              Delete
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
            <Field label="New password" htmlFor={`pw-${person.id}`} error={fields.password} hint="They'll choose their own when they next sign in.">
              <input id={`pw-${person.id}`} className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
          </div>
          <button className="btn-primary" disabled={update.isPending}>
            Set password
          </button>
        </form>
      )}
      {!fields.password && <ErrorNote error={update.error} />}
      {deleting && <ConfirmDelete person={person} onCancel={() => setDeleting(false)} />}
    </li>
  );
}

function ConfirmDelete({ person, onCancel }: { person: PublicUser; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/users/${person.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.users });
      void queryClient.invalidateQueries({ queryKey: keys.tickets() });
    },
  });
  const matches = typed.trim().toLowerCase() === person.name.trim().toLowerCase();

  return (
    <form
      className="mt-3 space-y-3 rounded-xl border border-red-300 p-3.5 text-sm dark:border-red-900"
      onSubmit={(e) => {
        e.preventDefault();
        if (matches) remove.mutate();
      }}
    >
      <p>
        <span className="font-semibold">Delete {person.name} for good?</span> This removes their account, every ticket
        they reported (with its photos and messages), and anything they wrote on other tickets.{" "}
        <span className="font-semibold">This can't be undone.</span> To keep their history, deactivate them instead.
      </p>
      <Field label={`Type ${person.name} to confirm`} htmlFor={`del-${person.id}`}>
        <input id={`del-${person.id}`} className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <ErrorNote error={remove.error} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-danger" disabled={!matches || remove.isPending}>
          {remove.isPending ? "Deleting…" : `Delete ${person.name}`}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
