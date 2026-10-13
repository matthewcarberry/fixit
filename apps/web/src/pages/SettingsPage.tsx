import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Share } from "lucide-react";
import type { PublicUser } from "@fixit/shared";
import { ErrorNote, Field, PageHeader } from "../components/ui";
import { api, RequestError } from "../lib/api";
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
