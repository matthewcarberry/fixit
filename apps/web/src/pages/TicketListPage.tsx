import clsx from "clsx";
import { useState } from "react";
import { Link } from "react-router";
import { CalendarClock, MessageSquare, Plus, Search } from "lucide-react";
import type { PublicUser, TicketListQuery, TicketSummary } from "@fixit/shared";
import { CategoryIcon, EmptyState, ErrorNote, PageHeader, Spinner, StatusBadge, UrgencyTag } from "../components/ui";
import { formatDueDate, isOverdue, timeAgo } from "../lib/format";
import { useCategories, useTickets } from "../lib/queries";

type StatusFilter = NonNullable<TicketListQuery["status"]>;

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "new", label: "New" },
  { value: "waiting_on_requester", label: "Waiting on requester" },
  { value: "waiting_on_parts", label: "Waiting on parts" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const REQUESTER_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
];

export function TicketListPage({ user }: { user: PublicUser }) {
  const admin = user.role === "admin";
  const [status, setStatus] = useState<StatusFilter>("open");
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [sort, setSort] = useState<NonNullable<TicketListQuery["sort"]>>("priority");
  const [q, setQ] = useState("");
  const query: TicketListQuery = { status, categoryId, sort, q: q.trim() || undefined };
  const tickets = useTickets(query);
  const categories = useCategories();

  return (
    <div>
      <PageHeader
        title={admin ? "Queue" : "My tickets"}
        action={
          <Link to="/new" className="btn-primary hidden sm:inline-flex">
            <Plus className="size-4" aria-hidden /> New ticket
          </Link>
        }
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-muted" aria-hidden />
          <input
            type="search"
            className="input pl-10"
            placeholder="Search tickets"
            aria-label="Search tickets"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Filter by status">
          {(admin ? FILTERS : REQUESTER_FILTERS).map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={status === f.value}
              onClick={() => setStatus(f.value)}
              className={clsx(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium",
                status === f.value ? "border-brand-700 bg-brand-700 text-white" : "border-default bg-[var(--surface)]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        {admin && (
          <div className="flex flex-wrap gap-2">
            <select
              className="input w-auto py-2 text-sm"
              aria-label="Category"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input w-auto py-2 text-sm"
              aria-label="Sort"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="priority">Highest priority first</option>
              <option value="due">Due soonest</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="updated">Recently updated</option>
            </select>
          </div>
        )}
      </div>

      {tickets.isPending ? (
        <Spinner />
      ) : tickets.error ? (
        <ErrorNote error={tickets.error} />
      ) : tickets.data.length === 0 ? (
        <EmptyState title={q ? "No tickets match that search" : status === "open" ? "Nothing open. Nice." : "No tickets here"}>
          {!admin && status === "open" && (
            <Link to="/new" className="text-brand-700 underline dark:text-brand-500">
              Report something that needs fixing
            </Link>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {tickets.data.map((t) => (
            <TicketRow key={t.id} ticket={t} showRequester={admin} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TicketRow({ ticket: t, showRequester }: { ticket: TicketSummary; showRequester: boolean }) {
  const overdue = isOverdue(t.dueDate) && t.status !== "closed" && t.status !== "resolved";
  return (
    <li>
      <Link to={`/tickets/${t.id}`} className="card flex gap-3 p-4 transition hover:border-brand-600">
        <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
          <CategoryIcon icon={t.category?.icon ?? "wrench"} className="size-5 text-brand-700 dark:text-brand-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold leading-snug">{t.title}</p>
            <span className="hidden sm:block">
              <StatusBadge status={t.status} />
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{t.number}</span>
            <UrgencyTag urgency={t.priority} />
            {showRequester && <span>{t.requester.name}</span>}
            <span>{t.category?.name ?? "Uncategorized"}</span>
            {t.dueDate && (
              <span className={clsx("inline-flex items-center gap-1", overdue && "font-semibold text-red-700 dark:text-red-400")}>
                <CalendarClock className="size-3.5" aria-hidden />
                {overdue ? "Overdue: " : "Due "}
                {formatDueDate(t.dueDate)}
              </span>
            )}
            {t.commentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-3.5" aria-hidden />
                {t.commentCount}
              </span>
            )}
            <span>Updated {timeAgo(t.updatedAt)}</span>
          </div>
          <div className="mt-2 sm:hidden">
            <StatusBadge status={t.status} />
          </div>
        </div>
      </Link>
    </li>
  );
}
