import { and, eq, lte } from "drizzle-orm";
import type { Config } from "../config";
import type { DB } from "../db";
import { tickets } from "../db/schema";
import { pruneExpiredSessions } from "../lib/auth";
import { addHours, nowIso } from "../lib/time";
import type { Notifier } from "./notifier";
import type { TicketService } from "./tickets";

interface Logger {
  info(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * Time-based ticket rules. All state lives in the database, so a restart never loses a timer:
 *
 * - Resolved tickets close after `resolvedAutoCloseHours` with no reopen.
 * - Waiting on requester tickets remind the requester every `waitingReminderHours`. The
 *   status change itself is reminder 1; once `waitingMaxReminders` have gone out and one more
 *   interval passes (max x interval hours in total), the ticket closes.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: DB,
    private readonly config: Config,
    private readonly ticketsService: TicketService,
    private readonly notifier: Notifier,
    private readonly log: Logger,
  ) {}

  start() {
    this.stop();
    const run = () => {
      try {
        this.runOnce();
      } catch (err) {
        this.log.error({ err }, "scheduler run failed");
      }
    };
    run();
    this.timer = setInterval(run, this.config.schedulerIntervalSeconds * 1000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  runOnce(now: Date = new Date()) {
    const nowStr = nowIso(now);
    const { resolvedAutoCloseHours, waitingReminderHours, waitingMaxReminders } = this.config;

    // 1. Resolved long enough: close.
    const resolvedCutoff = addHours(nowStr, -resolvedAutoCloseHours);
    const resolved = this.db
      .select()
      .from(tickets)
      .where(and(eq(tickets.status, "resolved"), lte(tickets.statusChangedAt, resolvedCutoff)))
      .all();
    for (const ticket of resolved) {
      this.autoClose(ticket.id, `Closed automatically after ${describeHours(resolvedAutoCloseHours)} in Resolved.`);
    }

    // 2. Waiting on requester: send due reminders, then close.
    const waiting = this.db.select().from(tickets).where(eq(tickets.status, "waiting_on_requester")).all();
    for (const ticket of waiting) {
      const closeAt = addHours(ticket.statusChangedAt, waitingMaxReminders * waitingReminderHours);
      if (ticket.remindersSent >= waitingMaxReminders && nowStr >= closeAt) {
        this.autoClose(
          ticket.id,
          `Closed automatically after ${waitingMaxReminders} reminders with no reply. Reopen it any time.`,
        );
        continue;
      }
      if (ticket.remindersSent >= waitingMaxReminders) continue;
      const nextAt = addHours(ticket.statusChangedAt, ticket.remindersSent * waitingReminderHours);
      if (nowStr < nextAt) continue;

      const reminder = ticket.remindersSent + 1;
      this.db
        .update(tickets)
        .set({ remindersSent: reminder, lastReminderAt: nowStr })
        .where(eq(tickets.id, ticket.id))
        .run();
      const last = reminder === waitingMaxReminders;
      this.notifier.notify({
        userIds: [ticket.requesterId],
        ticket,
        kind: "reminder",
        message: last
          ? `Last reminder: this ticket needs your reply. It will close automatically in ${describeHours(waitingReminderHours)}.`
          : `Reminder ${reminder} of ${waitingMaxReminders}: this ticket is waiting on your reply.`,
      });
      this.ticketsService.logActivity(ticket.id, null, "reminder", null, `Reminder ${reminder} of ${waitingMaxReminders}`);
    }

    pruneExpiredSessions(this.db);
  }

  private autoClose(id: number, reason: string) {
    const ticket = this.ticketsService.changeStatus(null, id, "closed", { notify: false });
    this.ticketsService.logActivity(id, null, "auto_closed", null, reason);
    this.notifier.notify({
      userIds: [ticket.requesterId, ...this.notifier.adminIds()],
      ticket,
      kind: "auto_closed",
      message: reason,
    });
    this.log.info({ ticket: id }, "ticket auto-closed");
  }
}

function describeHours(hours: number) {
  return hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`;
}
