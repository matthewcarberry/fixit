import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CalendarClock, Lock, MapPin } from "lucide-react";
import {
  STATUSES,
  STATUS_LABELS,
  URGENCIES,
  URGENCY_LABELS,
  type Activity,
  type Attachment,
  type Comment,
  type PublicUser,
  type TicketDetail,
  type UpdateTicketInput,
} from "@fixit/shared";
import { PhotoPicker } from "../components/PhotoPicker";
import { CategoryIcon, ErrorNote, Spinner, StatusBadge, UrgencyTag } from "../components/ui";
import { api, uploadPhotos } from "../lib/api";
import { formatDateTime, formatDueDate, isOverdue, timeAgo } from "../lib/format";
import { keys, useCategories, useTicket } from "../lib/queries";

export function TicketPage({ user }: { user: PublicUser }) {
  const id = Number(useParams().id);
  const ticket = useTicket(id);
  const queryClient = useQueryClient();
  const admin = user.role === "admin";
  // On phones the manage panel sits right under the ticket; on wide screens it's a sidebar.
  const wide = useMediaQuery("(min-width: 1024px)");

  // Opening a ticket clears its alerts.
  useEffect(() => {
    if (!ticket.data) return;
    void api
      .post("/api/notifications/read", { ticketId: id })
      .then(() => queryClient.invalidateQueries({ queryKey: keys.notifications }));
  }, [id, ticket.data?.updatedAt, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  if (ticket.isPending) return <Spinner />;
  if (ticket.error) return <ErrorNote error={ticket.error} />;
  const t = ticket.data;

  return (
    <div>
      <Link to="/" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-[var(--text)]">
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Link>
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0 space-y-5">
          <Header ticket={t} />
          {admin && !wide && <AdminPanel ticket={t} />}
          {!admin && <RequesterActions ticket={t} />}
          <Timeline ticket={t} admin={admin} />
          {t.status !== "closed" || admin ? (
            <CommentBox ticket={t} admin={admin} />
          ) : (
            <p className="text-center text-sm text-muted">This ticket is closed. Reopen it above to add more.</p>
          )}
        </div>
        {admin && wide && <AdminPanel ticket={t} />}
      </div>
    </div>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function Header({ ticket: t }: { ticket: TicketDetail }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="font-medium">{t.number}</span>
        <StatusBadge status={t.status} />
        <UrgencyTag urgency={t.priority} />
      </div>
      <h1 className="mt-2 text-xl font-bold leading-tight sm:text-2xl">{t.title}</h1>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span className="inline-flex items-center gap-1">
          <CategoryIcon icon={t.category?.icon ?? "wrench"} className="size-4" />
          {t.category?.name ?? "Uncategorized"}
        </span>
        {t.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {t.location}
          </span>
        )}
        {t.dueDate && (
          <span className={clsx("inline-flex items-center gap-1", isOverdue(t.dueDate) && t.status !== "closed" && "text-red-700 dark:text-red-400")}>
            <CalendarClock className="size-4" aria-hidden />
            Due {formatDueDate(t.dueDate)}
          </span>
        )}
        <span>
          Opened by {t.requester.name} {timeAgo(t.createdAt)}
        </span>
      </div>
      <p className="mt-4 whitespace-pre-wrap break-words">{t.description}</p>
      <Photos items={t.attachments} />
    </section>
  );
}

function Photos({ items }: { items: Attachment[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {items.map((a) => (
        <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="block">
          <img src={a.url} alt={a.filename} loading="lazy" className="size-24 rounded-xl border border-default object-cover sm:size-28" />
        </a>
      ))}
    </div>
  );
}

function useTicketMutation<T>(id: number, fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.ticket(id) });
      void queryClient.invalidateQueries({ queryKey: keys.tickets() });
    },
  });
}

function RequesterActions({ ticket: t }: { ticket: TicketDetail }) {
  const confirm = useTicketMutation(t.id, () => api.post(`/api/tickets/${t.id}/confirm`));
  const reopen = useTicketMutation(t.id, () => api.post(`/api/tickets/${t.id}/reopen`));

  if (t.status === "waiting_on_requester") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
        This ticket is waiting on you. Reply below to keep it moving.
      </div>
    );
  }
  if (t.status !== "resolved" && t.status !== "closed") return null;
  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-sm">
        {t.status === "resolved" ? "Marked fixed. Is it working now?" : "This ticket is closed. Still a problem?"}
      </p>
      <div className="flex gap-2">
        {t.status === "resolved" && (
          <button className="btn-primary" onClick={() => confirm.mutate(undefined)} disabled={confirm.isPending}>
            Yes, it's fixed
          </button>
        )}
        <button className="btn-secondary" onClick={() => reopen.mutate(undefined)} disabled={reopen.isPending}>
          Reopen
        </button>
      </div>
      <ErrorNote error={confirm.error ?? reopen.error} />
    </div>
  );
}

type TimelineItem = { kind: "comment"; at: string; comment: Comment } | { kind: "activity"; at: string; activity: Activity };

function Timeline({ ticket: t, admin }: { ticket: TicketDetail; admin: boolean }) {
  const items = useMemo<TimelineItem[]>(
    () =>
      [
        ...t.comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, comment: c })),
        ...t.activity.filter((a) => a.field !== "created").map((a) => ({ kind: "activity" as const, at: a.createdAt, activity: a })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [t],
  );
  if (items.length === 0) return null;
  return (
    <section aria-label="Conversation and history">
      <ol className="space-y-3">
        {items.map((item) =>
          item.kind === "comment" ? (
            <CommentItem key={`c${item.comment.id}`} comment={item.comment} />
          ) : (
            <ActivityItem key={`a${item.activity.id}`} activity={item.activity} admin={admin} />
          ),
        )}
      </ol>
    </section>
  );
}

function CommentItem({ comment: c }: { comment: Comment }) {
  return (
    <li
      className={clsx(
        "rounded-2xl border p-4",
        c.internal ? "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30" : "card",
      )}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{c.author?.name ?? "Fixit"}</span>
        {c.internal && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <Lock className="size-3" aria-hidden /> Internal note
          </span>
        )}
        <span className="text-muted" title={formatDateTime(c.createdAt)}>
          {timeAgo(c.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words">{c.body}</p>
      <Photos items={c.attachments} />
    </li>
  );
}

const FIELD_LABELS: Record<string, string> = {
  status: "status",
  priority: "priority",
  urgency: "urgency",
  category: "category",
  dueDate: "due date",
  location: "location",
  title: "title",
  description: "description",
};

function ActivityItem({ activity: a, admin }: { activity: Activity; admin: boolean }) {
  const who = a.actor?.name ?? "Fixit";
  let text: string;
  if (a.field === "reminder") text = `Fixit sent a reminder (${a.newValue?.toLowerCase()})`;
  else if (a.field === "auto_closed") text = a.newValue ?? "Closed automatically";
  else if (a.field === "description") text = `${who} edited the description`;
  else {
    const label = FIELD_LABELS[a.field] ?? a.field;
    text = a.newValue ? `${who} changed ${label} to ${a.newValue}` : `${who} cleared the ${label}`;
  }
  if (!admin && a.field === "reminder") return null;
  return (
    <li className="flex items-center gap-2 px-2 text-sm text-muted">
      <span className="size-1.5 shrink-0 rounded-full bg-[var(--border)]" aria-hidden />
      <span>
        {text} · <span title={formatDateTime(a.createdAt)}>{timeAgo(a.createdAt)}</span>
      </span>
    </li>
  );
}

function CommentBox({ ticket: t, admin }: { ticket: TicketDetail; admin: boolean }) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const send = useTicketMutation(t.id, async () => {
    const { id } = await api.post<{ id: number }>(`/api/tickets/${t.id}/comments`, { body, internal });
    await uploadPhotos(t.id, photos, id);
  });

  return (
    <form
      className={clsx("card space-y-3 p-4", internal && "border-amber-400 dark:border-amber-700")}
      onSubmit={(e) => {
        e.preventDefault();
        send.mutate(undefined, {
          onSuccess: () => {
            setBody("");
            setPhotos([]);
          },
        });
      }}
    >
      <label htmlFor="reply" className="sr-only">
        Reply
      </label>
      <textarea
        id="reply"
        className="input min-h-24"
        placeholder={internal ? "Private note, only you can see this" : "Write a reply"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
      />
      <PhotoPicker files={photos} onChange={setPhotos} compact />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {admin ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="size-4 accent-amber-600" />
            Internal note
          </label>
        ) : (
          <span />
        )}
        <button className="btn-primary" disabled={send.isPending || !body.trim()}>
          {send.isPending ? "Sending…" : internal ? "Save note" : "Send reply"}
        </button>
      </div>
      <ErrorNote error={send.error} />
    </form>
  );
}

function AdminPanel({ ticket: t }: { ticket: TicketDetail }) {
  const categories = useCategories();
  const update = useTicketMutation(t.id, (input: UpdateTicketInput) => api.patch(`/api/tickets/${t.id}`, input));
  const save = (input: UpdateTicketInput) => update.mutate(input);

  return (
    <aside className="card h-fit space-y-4 p-4 lg:sticky lg:top-20">
      <h2 className="font-semibold">Manage</h2>
      <div>
        <label className="label" htmlFor="status">
          Status
        </label>
        <select id="status" className="input" value={t.status} onChange={(e) => save({ status: e.target.value as TicketDetail["status"] })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        {t.status === "waiting_on_requester" && (
          <p className="mt-1 text-xs text-muted">Reminders sent: {t.remindersSent}. Closes automatically if there's no reply.</p>
        )}
        {t.status === "resolved" && <p className="mt-1 text-xs text-muted">Closes automatically unless it's reopened.</p>}
      </div>
      <div>
        <label className="label" htmlFor="priority">
          Priority
        </label>
        <select id="priority" className="input" value={t.priority} onChange={(e) => save({ priority: e.target.value as TicketDetail["priority"] })}>
          {URGENCIES.map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABELS[u]}
            </option>
          ))}
        </select>
        {t.priority !== t.urgency && <p className="mt-1 text-xs text-muted">Requested as {URGENCY_LABELS[t.urgency]}.</p>}
      </div>
      <div>
        <label className="label" htmlFor="category">
          Category
        </label>
        <select
          id="category"
          className="input"
          value={t.category?.id ?? ""}
          onChange={(e) => save({ categoryId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Uncategorized</option>
          {categories.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active ? "" : " (hidden)"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="due">
          Due date
        </label>
        <input
          id="due"
          type="date"
          className="input"
          value={t.dueDate ?? ""}
          onChange={(e) => save({ dueDate: e.target.value || null })}
        />
      </div>
      <BlurField label="Location" id="location" value={t.location ?? ""} onSave={(v) => save({ location: v || null })} />
      <ErrorNote error={update.error} />
    </aside>
  );
}

function BlurField({ label, id, value, onSave }: { label: string; id: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={draft}
        maxLength={80}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== value && onSave(draft.trim())}
      />
    </div>
  );
}
