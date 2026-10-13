import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, KeyRound, Share } from "lucide-react";
import type { Passkey, PublicUser } from "@fixit/shared";
import { ErrorNote, Field, PageHeader } from "../components/ui";
import { api, RequestError } from "../lib/api";
import { timeAgo } from "../lib/format";
import { addPasskey, passkeysSupported } from "../lib/passkeys";
import { disablePush, enablePush, getPushState, isIos, type PushState } from "../lib/push";
import { getThemeChoice, setThemeChoice, type ThemeChoice } from "../lib/theme";
import { keys, useInfo } from "../lib/queries";

export function SettingsPage({ user }: { user: PublicUser }) {
  const queryClient = useQueryClient();
  const info = useInfo();
  const admin = user.role === "admin";

  const signOut = useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(keys.me, null);
      window.location.assign("/");
    },
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Settings" />
      {admin && (
        <section className="card divide-y divide-[var(--border)] overflow-hidden">
          <Link to="/settings/people" className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-2">
            <span>
              <span className="block font-medium">People</span>
              <span className="text-sm text-muted">Add family members, reset passwords</span>
            </span>
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
          <Link to="/settings/categories" className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-2">
            <span>
              <span className="block font-medium">Categories</span>
              <span className="text-sm text-muted">Change the list people pick from</span>
            </span>
            <ChevronRight className="size-4 text-muted" aria-hidden />
          </Link>
        </section>
      )}
      <Profile user={user} />
      <Notifications user={user} emailEnabled={info.data?.emailEnabled ?? false} />
      <Appearance />
      <Password />
      <Passkeys />
      <section className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">Fixit {info.data?.version}</span>
        <button className="btn-secondary" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
          Sign out
        </button>
      </section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4 p-5">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function useSaveMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Pick<PublicUser, "name" | "notifyPush" | "notifyEmail">>) =>
      api.patch<{ user: PublicUser }>("/api/me", input),
    onSuccess: ({ user }) => queryClient.setQueryData(keys.me, user),
  });
}

function Profile({ user }: { user: PublicUser }) {
  const [name, setName] = useState(user.name);
  const save = useSaveMe();
  return (
    <Section title="Profile">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ name });
        }}
      >
        <div className="flex-1">
          <Field label="Name" htmlFor="name">
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </Field>
        </div>
        <button className="btn-secondary" disabled={save.isPending || name.trim() === user.name}>
          {save.isSuccess && name.trim() === user.name ? "Saved" : "Save"}
        </button>
      </form>
      <p className="text-sm text-muted">Signed in as {user.email}</p>
    </Section>
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: "This browser can't show notifications.",
  "needs-install": "",
  insecure: "Phone notifications need Fixit to be opened over https (your domain), not a local address.",
  denied: "Notifications are blocked for this site. Allow them in your browser or phone settings.",
  off: "Get a notification on this device when a ticket changes.",
  on: "This device gets notifications.",
};

function Notifications({ user, emailEnabled }: { user: PublicUser; emailEnabled: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const save = useSaveMe();

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      setState(state === "on" ? await disablePush() : await enablePush());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Notifications">
      {state === "needs-install" ? (
        <div className="rounded-xl bg-surface-2 p-3.5 text-sm">
          <p className="font-medium">To get notifications on iPhone, add Fixit to your Home Screen:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>
              Tap the Share button <Share className="inline size-4" aria-label="Share" /> in Safari
            </li>
            <li>Choose “Add to Home Screen”</li>
            <li>Open Fixit from the new icon and come back here</li>
          </ol>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">{state ? PUSH_TEXT[state] : "Checking…"}</p>
          {(state === "on" || state === "off") && (
            <button className={state === "on" ? "btn-secondary" : "btn-primary"} onClick={toggle} disabled={busy}>
              {state === "on" ? "Turn off" : "Turn on"}
            </button>
          )}
        </div>
      )}
      <ErrorNote error={error} />
      {state === "on" && (
        <label className="flex items-center justify-between gap-3 text-sm">
          Send push notifications to my devices
          <input type="checkbox" className="size-5 accent-teal-700" checked={user.notifyPush} onChange={(e) => save.mutate({ notifyPush: e.target.checked })} />
        </label>
      )}
      {emailEnabled && (
        <label className="flex items-center justify-between gap-3 text-sm">
          Also email me at {user.email}
          <input type="checkbox" className="size-5 accent-teal-700" checked={user.notifyEmail} onChange={(e) => save.mutate({ notifyEmail: e.target.checked })} />
        </label>
      )}
      {isIos() && state === "on" && <p className="text-xs text-muted">Notifications go to this phone while Fixit is on the Home Screen.</p>}
    </Section>
  );
}

function Appearance() {
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice());
  return (
    <Section title="Appearance">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {(["system", "light", "dark"] as const).map((choice) => (
          <button
            key={choice}
            role="radio"
            aria-checked={theme === choice}
            onClick={() => {
              setTheme(choice);
              setThemeChoice(choice);
            }}
            className={
              theme === choice
                ? "rounded-xl border border-brand-700 bg-brand-50 py-2 text-sm font-semibold dark:bg-brand-900/40"
                : "rounded-xl border border-default py-2 text-sm"
            }
          >
            {choice === "system" ? "Automatic" : choice === "light" ? "Light" : "Dark"}
          </button>
        ))}
      </div>
    </Section>
  );
}

function Password() {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const change = useMutation({
    mutationFn: () => api.post("/api/auth/password", { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrent("");
      setNew("");
    },
  });
  const fields = change.error instanceof RequestError ? change.error.fields : {};
  return (
    <Section title="Password">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        <Field label="Current password" htmlFor="current">
          <input id="current" type="password" className="input" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <Field label="New password" htmlFor="new" error={fields.newPassword} hint="At least 10 characters. Signs out your other devices.">
          <input id="new" type="password" className="input" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} required />
        </Field>
        {!fields.newPassword && <ErrorNote error={change.error} />}
        {change.isSuccess && <p className="text-sm text-emerald-700 dark:text-emerald-400">Password changed.</p>}
        <button className="btn-secondary" disabled={change.isPending}>
          Change password
        </button>
      </form>
    </Section>
  );
}

function Passkeys() {
  const queryClient = useQueryClient();
  const [supported] = useState(passkeysSupported);
  const list = useQuery({
    queryKey: keys.passkeys,
    queryFn: async () => (await api.get<{ passkeys: Passkey[] }>("/api/auth/passkeys")).passkeys,
  });
  const add = useMutation({
    mutationFn: addPasskey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.passkeys }),
  });
  const passkeys = list.data ?? [];

  return (
    <Section title="Passkeys">
      <p className="text-sm text-muted">
        Sign in with Face ID, a fingerprint or your phone's screen lock instead of typing your password.
      </p>
      {passkeys.length > 0 && (
        <ul className="divide-y divide-[var(--border)] rounded-xl border border-default">
          {passkeys.map((p) => (
            <PasskeyRow key={p.id} passkey={p} />
          ))}
        </ul>
      )}
      <ErrorNote error={add.error ?? list.error} />
      {add.isSuccess && add.data && <p className="text-sm text-emerald-700 dark:text-emerald-400">Passkey added. You can use it next time you sign in.</p>}
      {supported ? (
        <button className="btn-secondary" onClick={() => add.mutate()} disabled={add.isPending}>
          <KeyRound className="size-4" aria-hidden />
          {add.isPending ? "Waiting for this device…" : "Add a passkey on this device"}
        </button>
      ) : (
        <p className="text-sm">This browser can't make passkeys here. Open Fixit at its https address to add one.</p>
      )}
    </Section>
  );
}

function PasskeyRow({ passkey }: { passkey: Passkey }) {
  const queryClient = useQueryClient();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(passkey.name);
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.passkeys });
  const rename = useMutation({
    mutationFn: () => api.patch(`/api/auth/passkeys/${passkey.id}`, { name }),
    onSuccess: async () => {
      await refresh();
      setRenaming(false);
    },
  });
  const remove = useMutation({ mutationFn: () => api.delete(`/api/auth/passkeys/${passkey.id}`), onSuccess: refresh });

  if (renaming) {
    return (
      <li className="p-3">
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            rename.mutate();
          }}
        >
          <div className="flex-1">
            <Field label="Passkey name" htmlFor={`passkey-${passkey.id}`}>
              <input id={`passkey-${passkey.id}`} className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required autoFocus />
            </Field>
          </div>
          <button className="btn-primary" disabled={rename.isPending}>
            Save
          </button>
          <button type="button" className="btn-secondary" onClick={() => setRenaming(false)}>
            Cancel
          </button>
        </form>
        <ErrorNote error={rename.error} />
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <span className="min-w-0">
        <span className="block truncate font-medium">{passkey.name}</span>
        <span className="text-xs text-muted">
          Added {timeAgo(passkey.createdAt)}
          {passkey.lastUsedAt ? `, last used ${timeAgo(passkey.lastUsedAt)}` : ", not used yet"}
        </span>
        <ErrorNote error={remove.error} />
      </span>
      <span className="flex shrink-0 gap-2">
        <button className="btn-secondary px-3 py-2" onClick={() => setRenaming(true)}>
          Rename
        </button>
        <button
          className="btn-secondary px-3 py-2"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`Remove the passkey "${passkey.name}"? You can still sign in with your password.`)) remove.mutate();
          }}
        >
          Remove
        </button>
      </span>
    </li>
  );
}
