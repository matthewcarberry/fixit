export const STATUSES = [
  "new",
  "in_progress",
  "waiting_on_requester",
  "waiting_on_parts",
  "resolved",
  "closed",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  new: "New",
  in_progress: "In progress",
  waiting_on_requester: "Waiting on requester",
  waiting_on_parts: "Waiting on parts",
  resolved: "Resolved",
  closed: "Closed",
};

/** Statuses that count as "open" for queues and badges. */
export const OPEN_STATUSES: readonly Status[] = [
  "new",
  "in_progress",
  "waiting_on_requester",
  "waiting_on_parts",
];

export const URGENCIES = ["low", "normal", "high", "urgent"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const URGENCY_LABELS: Record<Urgency, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const URGENCY_HINTS: Record<Urgency, string> = {
  low: "Whenever you get a chance",
  normal: "Sometime this week",
  high: "Soon, it's getting in the way",
  urgent: "It's broken right now",
};

export const URGENCY_RANK: Record<Urgency, number> = { low: 0, normal: 1, high: 2, urgent: 3 };

export const ROLES = ["requester", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const DEFAULT_CATEGORIES: { name: string; icon: string }[] = [
  { name: "Network / Wifi", icon: "wifi" },
  { name: "Computers and devices", icon: "laptop" },
  { name: "Pests", icon: "bug" },
  { name: "Plumbing", icon: "droplet" },
  { name: "Electrical", icon: "zap" },
  { name: "Appliances", icon: "refrigerator" },
  { name: "Other", icon: "wrench" },
];

export const CATEGORY_ICONS = [
  "wifi",
  "laptop",
  "bug",
  "droplet",
  "zap",
  "refrigerator",
  "wrench",
  "tv",
  "car",
  "home",
  "lightbulb",
  "thermometer",
  "lock",
  "printer",
  "tree",
  "hammer",
] as const;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export const NOTIFICATION_KINDS = [
  "ticket_created",
  "comment",
  "status_changed",
  "reminder",
  "auto_closed",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
