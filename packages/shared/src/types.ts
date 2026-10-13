import type { NotificationKind, Role, Status, Urgency } from "./constants";

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  notifyPush: boolean;
  notifyEmail: boolean;
  /** The admin set this person's password; they must choose their own before using Fixit. */
  mustChangePassword: boolean;
  createdAt: string;
}

/** A passkey someone has added to their account, as shown in Settings. */
export interface Passkey {
  id: number;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** What happened to the welcome email when the admin added someone. */
export type WelcomeEmailResult = "sent" | "failed" | "not_configured";

export interface CreatedUser {
  user: PublicUser;
  welcomeEmail: WelcomeEmailResult;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  active: boolean;
  sortOrder: number;
}

export interface UserRef {
  id: number;
  name: string;
}

export interface TicketSummary {
  id: number;
  number: string;
  title: string;
  status: Status;
  urgency: Urgency;
  priority: Urgency;
  category: Category | null;
  location: string | null;
  dueDate: string | null;
  requester: UserRef;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: number;
  commentId: number | null;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: UserRef | null;
  createdAt: string;
}

export interface Comment {
  id: number;
  body: string;
  internal: boolean;
  author: UserRef | null;
  attachments: Attachment[];
  createdAt: string;
}

export interface Activity {
  id: number;
  actor: UserRef | null;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  remindersSent: number;
  statusChangedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  attachments: Attachment[];
  comments: Comment[];
  activity: Activity[];
}

export interface AppNotification {
  id: number;
  ticketId: number | null;
  ticketNumber: string | null;
  kind: NotificationKind;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface AppInfo {
  needsSetup: boolean;
  version: string;
  ticketPrefix: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  fields?: Record<string, string>;
}
