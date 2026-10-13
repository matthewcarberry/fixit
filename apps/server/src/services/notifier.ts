import { and, eq, inArray } from "drizzle-orm";
import type { NotificationKind } from "@fixit/shared";
import type { Config } from "../config";
import type { DB } from "../db";
import { notifications, users, type TicketRow } from "../db/schema";
import type { EmailService } from "./email";
import type { PushService } from "./push";

export interface NotifyInput {
  userIds: number[];
  ticket: Pick<TicketRow, "id" | "title">;
  kind: NotificationKind;
  message: string;
}

/** Records in-app notifications and fans them out to push and email. */
export class Notifier {
  /** Delivery promises still in flight; tests await these. */
  readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly db: DB,
    private readonly config: Config,
    private readonly push: PushService,
    private readonly email: EmailService,
  ) {}

  ticketNumber(id: number) {
    return `${this.config.ticketPrefix}-${id}`;
  }

  adminIds(): number[] {
    return this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.active, true)))
      .all()
      .map((u) => u.id);
  }

  notify({ userIds, ticket, kind, message }: NotifyInput) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return;
    const recipients = this.db
      .select()
      .from(users)
      .where(and(inArray(users.id, ids), eq(users.active, true)))
      .all();
    if (recipients.length === 0) return;

    this.db
      .insert(notifications)
      .values(recipients.map((u) => ({ userId: u.id, ticketId: ticket.id, kind, message })))
      .run();

    const number = this.ticketNumber(ticket.id);
    const path = `/tickets/${ticket.id}`;
    const link = this.config.publicUrl ? `${this.config.publicUrl}${path}` : path;
    const title = `${number}: ${ticket.title}`;

    for (const user of recipients) {
      if (user.notifyPush) {
        this.track(this.push.sendToUser(user.id, { title, body: message, url: path, tag: `ticket-${ticket.id}` }));
      }
      if (user.notifyEmail && this.email.enabled) {
        this.track(this.email.send(user.email, `[${number}] ${ticket.title}`, `${message}\n\nOpen the ticket: ${link}\n`));
      }
    }
  }

  private track(promise: Promise<unknown>) {
    const p = promise.catch(() => undefined).finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  async flush() {
    await Promise.all([...this.pending]);
  }
}
