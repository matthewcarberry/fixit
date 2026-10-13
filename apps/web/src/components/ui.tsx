import clsx from "clsx";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bug,
  Car,
  Droplet,
  Hammer,
  House,
  Laptop,
  Lightbulb,
  Lock,
  Printer,
  Refrigerator,
  Thermometer,
  TreeDeciduous,
  Tv,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { STATUS_LABELS, URGENCY_LABELS, type Status, type Urgency } from "@fixit/shared";

const ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  laptop: Laptop,
  bug: Bug,
  droplet: Droplet,
  zap: Zap,
  refrigerator: Refrigerator,
  wrench: Wrench,
  tv: Tv,
  car: Car,
  home: House,
  lightbulb: Lightbulb,
  thermometer: Thermometer,
  lock: Lock,
  printer: Printer,
  tree: TreeDeciduous,
  hammer: Hammer,
};

export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Wrench;
  return <Icon className={className} aria-hidden />;
}

const STATUS_STYLES: Record<Status, string> = {
  new: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  in_progress: "bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-100",
  waiting_on_requester: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  waiting_on_parts: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  closed: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
};

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", STATUS_STYLES[status], className)}>
      {STATUS_LABELS[status]}
    </span>
  );
}

const URGENCY_STYLES: Record<Urgency, string> = {
  low: "text-muted",
  normal: "text-muted",
  high: "text-orange-700 dark:text-orange-400",
  urgent: "text-red-700 dark:text-red-400",
};

export function UrgencyTag({ urgency }: { urgency: Urgency }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 text-xs font-semibold", URGENCY_STYLES[urgency])}>
      {urgency === "urgent" && <AlertTriangle className="size-3.5" aria-hidden />}
      {URGENCY_LABELS[urgency]}
    </span>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-sm text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-800 dark:bg-red-950/60 dark:text-red-300">
      {message}
    </p>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex justify-center py-12" role="status" aria-label={label}>
      <div className="size-7 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}
