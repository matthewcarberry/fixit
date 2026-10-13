import { z } from "zod";
import { CATEGORY_ICONS, ROLES, STATUSES, URGENCIES } from "./constants";

const trimmed = (max: number) => z.string().trim().max(max);
const email = z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address" }));
const password = z.string().min(10, "Use at least 10 characters").max(200);
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable();

export const setupSchema = z.object({
  name: trimmed(80).min(1, "Enter your name"),
  email,
  password,
});
export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const passkeyNameSchema = z.object({
  name: trimmed(60).min(1, "Give the passkey a name"),
});

export const preferencesSchema = z.object({
  name: trimmed(80).min(1).optional(),
  notifyPush: z.boolean().optional(),
  notifyEmail: z.boolean().optional(),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

export const createUserSchema = z.object({
  name: trimmed(80).min(1, "Enter a name"),
  email,
  role: z.enum(ROLES).default("requester"),
  password,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: trimmed(80).min(1).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const categorySchema = z.object({
  name: trimmed(60).min(1, "Enter a name"),
  icon: z.enum(CATEGORY_ICONS).default("wrench"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const updateCategorySchema = categorySchema.partial();
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const createTicketSchema = z.object({
  title: trimmed(140).min(1, "Give it a short title"),
  description: trimmed(10_000).min(1, "Describe what's wrong"),
  categoryId: z.number().int().positive().nullable().default(null),
  urgency: z.enum(URGENCIES).default("normal"),
  location: trimmed(80).nullable().default(null),
});
export type CreateTicketInput = z.input<typeof createTicketSchema>;

/** Fields only the admin (agent) may change. */
export const updateTicketSchema = z.object({
  title: trimmed(140).min(1).optional(),
  description: trimmed(10_000).min(1).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  urgency: z.enum(URGENCIES).optional(),
  priority: z.enum(URGENCIES).optional(),
  status: z.enum(STATUSES).optional(),
  location: trimmed(80).nullable().optional(),
  dueDate: dateOnly.optional(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

export const createCommentSchema = z.object({
  body: trimmed(10_000).min(1, "Write a message"),
  internal: z.boolean().default(false),
});
export type CreateCommentInput = z.input<typeof createCommentSchema>;

export const ticketListQuerySchema = z.object({
  status: z.enum([...STATUSES, "open", "all"]).default("open"),
  categoryId: z.coerce.number().int().positive().optional(),
  q: trimmed(200).optional(),
  sort: z.enum(["priority", "newest", "oldest", "due", "updated"]).default("priority"),
});
export type TicketListQuery = z.input<typeof ticketListQuerySchema>;

export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;
