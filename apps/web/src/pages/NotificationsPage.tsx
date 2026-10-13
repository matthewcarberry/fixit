import clsx from "clsx";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorNote, PageHeader, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { keys, useNotifications } from "../lib/queries";

export function NotificationsPage() {
  const notifications = useNotifications();
  const queryClient = useQueryClient();
  const markAll = useMutation({
    mutationFn: () => api.post("/api/notifications/read", {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications }),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Alerts"
        action={
          notifications.data?.unread ? (
            <button className="btn-secondary" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
              Mark all read
            </button>
          ) : null
        }
      />
      {notifications.isPending ? (
        <Spinner />
      ) : notifications.error ? (
        <ErrorNote error={notifications.error} />
      ) : notifications.data.items.length === 0 ? (
        <EmptyState title="No alerts yet">Updates on your tickets will show up here.</EmptyState>
      ) : (
        <ul className="card divide-y divide-[var(--border)] overflow-hidden">
          {notifications.data.items.map((n) => (
            <li key={n.id}>
              <Link
                to={n.ticketId ? `/tickets/${n.ticketId}` : "/"}
                className={clsx("flex gap-3 px-4 py-3.5 hover:bg-surface-2", !n.read && "bg-brand-50/60 dark:bg-brand-900/20")}
              >
                <span
                  className={clsx("mt-2 size-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-brand-600")}
                  aria-label={n.read ? undefined : "Unread"}
                />
                <div className="min-w-0">
                  <p className="text-sm">{n.message}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {n.ticketNumber} · {timeAgo(n.createdAt)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
