import clsx from "clsx";
import { Bell, Inbox, Plus, Settings } from "lucide-react";
import { NavLink, Outlet } from "react-router";
import type { PublicUser } from "@fixit/shared";
import { useNotifications } from "../lib/queries";

export function Layout({ user }: { user: PublicUser }) {
  const { data } = useNotifications();
  const unread = data?.unread ?? 0;
  const admin = user.role === "admin";
  const items = [
    { to: "/", label: admin ? "Queue" : "My tickets", icon: Inbox, end: true },
    { to: "/new", label: "New", icon: Plus },
    { to: "/notifications", label: "Alerts", icon: Bell, badge: unread },
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-default bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-bold">
            <img src="/icons/favicon.svg" alt="" className="size-7" />
            Fixit
          </NavLink>
          <nav className="ml-auto hidden items-center gap-1 sm:flex" aria-label="Main">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    "relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
                    isActive ? "bg-surface-2" : "text-muted hover:text-[var(--text)]",
                  )
                }
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
                {item.badge ? <Badge count={item.badge} /> : null}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:pb-12">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-default bg-[var(--surface)] sm:hidden"
      >
        <div className="grid grid-cols-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  "relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                  isActive ? "text-brand-700 dark:text-brand-500" : "text-muted",
                )
              }
            >
              <span
                className={clsx(
                  "relative flex items-center justify-center",
                  item.to === "/new" && "size-9 -mt-1 rounded-full bg-brand-700 text-white",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.badge ? <Badge count={item.badge} floating /> : null}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function Badge({ count, floating }: { count: number; floating?: boolean }) {
  return (
    <span
      aria-label={`${count} unread`}
      className={clsx(
        "min-w-5 rounded-full bg-red-600 px-1.5 text-center text-[11px] font-bold leading-5 text-white",
        floating && "absolute -right-3 -top-2",
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
