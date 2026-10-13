import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import {
  OPEN_STATUSES,
  STATUS_LABELS,
  URGENCY_LABELS,
  type Activity,
  type Attachment,
  type Category,
  type Comment,
  type CreateCommentInput,
  type Status,
  type TicketDetail,
  type TicketListQuery,
  type TicketSummary,
  type UpdateTicketInput,
  createCommentSchema,
  createTicketSchema,
  ticketListQuerySchema,
  type CreateTicketInput,
} from "@fixit/shared";
import type { Config } from "../config";
import type { DB } from "../db";
import {
  activities,
  attachments,
  categories,
  comments,
  tickets,
  users,
  type CategoryRow,
  type TicketRow,
  type UserRow,
} from "../db/schema";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { nowIso } from "../lib/time";
import type { Notifier } from "./notifier";

type Actor = Pick<UserRow, "id" | "role" | "name">;

const isAdmin = (actor: Actor) => actor.role === "admin";

const PRIORITY_ORDER = sql`CASE ${tickets.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`;

function toCategory(row: CategoryRow | null): Category | null {
  return row ? { id: row.id, name: row.name, icon: row.icon, active: row.active, sortOrder: row.sortOrder } : null;
}

export class TicketService {
  constructor(
    private readonly db: DB,
    private readonly config: Config,
    private readonly notifier: Notifier,
  ) {}

  number(id: number) {
    return `${this.config.ticketPrefix}-${id}`;
  }

  // ---------- reads ----------

  list(actor: Actor, rawQuery: TicketListQuery): TicketSummary[] {
    const query = ticketListQuerySchema.parse(rawQuery);
    const where: SQL[] = [];
    if (!isAdmin(actor)) where.push(eq(tickets.requesterId, actor.id));
    if (query.status === "open") where.push(inArray(tickets.status, [...OPEN_STATUSES]));
    else if (query.status !== "all") where.push(eq(tickets.status, query.status));
    if (query.categoryId) where.push(eq(tickets.categoryId, query.categoryId));
    if (query.q) {
      const term = `%${query.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      const commentMatch = sql`EXISTS (SELECT 1 FROM ${comments} WHERE ${comments.ticketId} = ${tickets.id} AND ${comments.body} LIKE ${term} ESCAPE '\\' ${
        isAdmin(actor) ? sql`` : sql`AND ${comments.internal} = 0`
      })`;
      const numberMatch = /^\D*(\d+)$/.exec(query.q);
      const conditions: SQL[] = [
        sql`${tickets.title} LIKE ${term} ESCAPE '\\'`,
        sql`${tickets.description} LIKE ${term} ESCAPE '\\'`,
        commentMatch,
      ];
      if (numberMatch?.[1]) conditions.push(eq(tickets.id, Number(numberMatch[1])));
      where.push(or(...conditions)!);
    }

    const order = {
      priority: [PRIORITY_ORDER, asc(tickets.createdAt)],
      newest: [desc(tickets.createdAt)],
      oldest: [asc(tickets.createdAt)],
      due: [sql`${tickets.dueDate} IS NULL`, asc(tickets.dueDate), PRIORITY_ORDER],
      updated: [desc(tickets.updatedAt)],
    }[query.sort];

    const rows = this.db
      .select({
        ticket: tickets,
        category: categories,
        requesterName: users.name,
        commentCount: isAdmin(actor)
          ? sql<number>`(SELECT COUNT(*) FROM ${comments} WHERE ${comments.ticketId} = ${tickets.id})`
          : sql<number>`(SELECT COUNT(*) FROM ${comments} WHERE ${comments.ticketId} = ${tickets.id} AND ${comments.internal} = 0)`,
      })
      .from(tickets)
      .leftJoin(categories, eq(categories.id, tickets.categoryId))
      .innerJoin(users, eq(users.id, tickets.requesterId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(...order)
      .limit(500)
      .all();

    return rows.map((r) => this.summary(r.ticket, r.category, r.requesterName, r.commentCount));
  }

  private summary(t: TicketRow, category: CategoryRow | null, requesterName: string, commentCount: number): TicketSummary {
    return {
      id: t.id,
      number: this.number(t.id),
      title: t.title,
      status: t.status,
      urgency: t.urgency,
      priority: t.priority,
      category: toCategory(category),
      location: t.location,
      dueDate: t.dueDate,
      requester: { id: t.requesterId, name: requesterName },
      commentCount,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  /** Loads a ticket the actor may see, or throws. */
  getRow(actor: Actor, id: number): TicketRow {
    const ticket = this.db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!ticket) throw notFound("That ticket");
    // Requesters get "not found" for other people's tickets so ticket numbers don't leak.
    if (!isAdmin(actor) && ticket.requesterId !== actor.id) throw notFound("That ticket");
    return ticket;
  }

  detail(actor: Actor, id: number): TicketDetail {
    const t = this.getRow(actor, id);
    const admin = isAdmin(actor);
    const category = t.categoryId
      ? (this.db.select().from(categories).where(eq(categories.id, t.categoryId)).get() ?? null)
      : null;
    const names = new Map(
      this.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .all()
        .map((u) => [u.id, u.name]),
    );
    const ref = (userId: number | null) => (userId ? { id: userId, name: names.get(userId) ?? "Unknown" } : null);

    const commentRows = this.db
      .select()
      .from(comments)
      .where(admin ? eq(comments.ticketId, id) : and(eq(comments.ticketId, id), eq(comments.internal, false)))
      .orderBy(asc(comments.createdAt), asc(comments.id))
      .all();
    const visibleCommentIds = new Set(commentRows.map((c) => c.id));

    const attachmentRows = this.db
      .select()
      .from(attachments)
      .where(eq(attachments.ticketId, id))
      .orderBy(asc(attachments.id))
      .all()
      .filter((a) => a.commentId === null || visibleCommentIds.has(a.commentId));

    const toAttachment = (a: (typeof attachmentRows)[number]): Attachment => ({
      id: a.id,
      commentId: a.commentId,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      url: `/api/attachments/${a.id}`,
      uploadedBy: ref(a.uploadedBy),
      createdAt: a.createdAt,
    });

    const commentList: Comment[] = commentRows.map((c) => ({
      id: c.id,
      body: c.body,
      internal: c.internal,
      author: ref(c.authorId),
      attachments: attachmentRows.filter((a) => a.commentId === c.id).map(toAttachment),
      createdAt: c.createdAt,
    }));

    const activityList: Activity[] = this.db
      .select()
      .from(activities)
      .where(eq(activities.ticketId, id))
      .orderBy(asc(activities.createdAt), asc(activities.id))
      .all()
      // Requesters see the ticket's story, not Matt's private bookkeeping.
      .filter((a) => admin || ["created", "status", "category", "title"].includes(a.field))
      .map((a) => ({
        id: a.id,
        actor: ref(a.actorId),
        field: a.field,
        oldValue: a.oldValue,
        newValue: a.newValue,
        createdAt: a.createdAt,
      }));

    return {
      ...this.summary(t, category, names.get(t.requesterId) ?? "Unknown", commentList.length),
      description: t.description,
      remindersSent: t.remindersSent,
      statusChangedAt: t.statusChangedAt,
      resolvedAt: t.resolvedAt,
      closedAt: t.closedAt,
      attachments: attachmentRows.filter((a) => a.commentId === null).map(toAttachment),
      comments: commentList,
      activity: activityList,
    };
  }

  // ---------- writes ----------

  create(actor: Actor, raw: CreateTicketInput): TicketRow {
    const input = createTicketSchema.parse(raw);
    if (input.categoryId) this.requireCategory(input.categoryId, true);
    const ticket = this.db
      .insert(tickets)
      .values({
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        urgency: input.urgency,
        priority: input.urgency,
        location: input.location || null,
        requesterId: actor.id,
      })
      .returning()
      .get();
    this.logActivity(ticket.id, actor.id, "created", null, null);
    this.notifier.notify({
      userIds: this.notifier.adminIds().filter((id) => id !== actor.id),
      ticket,
      kind: "ticket_created",
      message: `${actor.name} opened a new ${URGENCY_LABELS[ticket.urgency].toLowerCase()} urgency ticket: ${ticket.title}`,
    });
    return ticket;
  }

  update(actor: Actor, id: number, input: UpdateTicketInput): TicketRow {
    if (!isAdmin(actor)) throw forbidden("Only the admin can edit ticket details");
    const before = this.getRow(actor, id);
    if (input.categoryId) this.requireCategory(input.categoryId, false);

    const changes: Partial<TicketRow> = {};
    const fields = ["title", "description", "categoryId", "urgency", "priority", "location", "dueDate"] as const;
    for (const field of fields) {
      const value = input[field];
      if (value === undefined || value === before[field]) continue;
      (changes as Record<string, unknown>)[field] = value;
      this.logActivity(
        id,
        actor.id,
        field === "categoryId" ? "category" : field,
        this.describe(field, before[field]),
        this.describe(field, value),
      );
    }
    if (Object.keys(changes).length > 0) {
      this.db.update(tickets).set({ ...changes, updatedAt: nowIso() }).where(eq(tickets.id, id)).run();
    }
    if (input.status && input.status !== before.status) {
      this.changeStatus(actor, id, input.status);
    }
    return this.getRow(actor, id);
  }

  /**
   * Moves a ticket to a new status, resetting the reminder clock, and tells the other side.
   * `actor` is null when the system (scheduler) makes the change.
   */
  changeStatus(actor: Actor | null, id: number, status: Status, opts: { notify?: boolean } = {}): TicketRow {
    const before = this.db.select().from(tickets).where(eq(tickets.id, id)).get();
    if (!before) throw notFound("That ticket");
    if (before.status === status) return before;

    const now = nowIso();
    const waiting = status === "waiting_on_requester";
    const after = this.db
      .update(tickets)
      .set({
        status,
        statusChangedAt: now,
        updatedAt: now,
        // The status-change notice counts as the first reminder.
        remindersSent: waiting ? 1 : 0,
        lastReminderAt: waiting ? now : null,
        resolvedAt: status === "resolved" ? now : before.resolvedAt,
        closedAt: status === "closed" ? now : null,
      })
      .where(eq(tickets.id, id))
      .returning()
      .get();
    this.logActivity(id, actor?.id ?? null, "status", STATUS_LABELS[before.status], STATUS_LABELS[status]);

    if (opts.notify === false) return after;
    const by = actor?.name ?? "Fixit";
    if (actor === null || isAdmin(actor)) {
      if (after.requesterId !== actor?.id) {
        this.notifier.notify({
          userIds: [after.requesterId],
          ticket: after,
          kind: waiting ? "reminder" : "status_changed",
          message: this.statusMessage(status, by),
        });
      }
    } else {
      this.notifier.notify({
        userIds: this.notifier.adminIds(),
        ticket: after,
        kind: "status_changed",
        message: `${by} moved this ticket to ${STATUS_LABELS[status]}`,
      });
    }
    return after;
  }

  private statusMessage(status: Status, by: string): string {
    switch (status) {
      case "waiting_on_requester":
        return `${by} needs something from you to keep going. Open the ticket and reply.`;
      case "resolved":
        return `${by} marked this fixed. Confirm it, or reopen it if it's still a problem.`;
      case "in_progress":
        return `${by} is working on it.`;
      case "waiting_on_parts":
        return `${by} is waiting on parts before this can be fixed.`;
      case "closed":
        return `${by} closed this ticket.`;
      default:
        return `${by} moved this ticket to ${STATUS_LABELS[status]}.`;
    }
  }

  addComment(actor: Actor, id: number, raw: CreateCommentInput) {
    const input = createCommentSchema.parse(raw);
    const ticket = this.getRow(actor, id);
    const internal = isAdmin(actor) ? input.internal : false;
    const comment = this.db
      .insert(comments)
      .values({ ticketId: id, authorId: actor.id, body: input.body, internal })
      .returning()
      .get();
    this.db.update(tickets).set({ updatedAt: nowIso() }).where(eq(tickets.id, id)).run();

    if (!isAdmin(actor)) {
      // A reply from the requester answers the "waiting on you" question.
      if (ticket.status === "waiting_on_requester") this.changeStatus(actor, id, "in_progress", { notify: false });
      this.notifier.notify({
        userIds: this.notifier.adminIds(),
        ticket,
        kind: "comment",
        message: `${actor.name}: ${preview(input.body)}`,
      });
    } else if (!internal && ticket.requesterId !== actor.id) {
      this.notifier.notify({
        userIds: [ticket.requesterId],
        ticket,
        kind: "comment",
        message: `${actor.name}: ${preview(input.body)}`,
      });
    }
    return comment;
  }

  /** Requester confirms a resolved ticket is fixed. */
  confirm(actor: Actor, id: number) {
    const ticket = this.getRow(actor, id);
    if (ticket.status !== "resolved") throw badRequest("Only resolved tickets can be confirmed");
    if (!isAdmin(actor) && ticket.requesterId !== actor.id) throw forbidden();
    return this.changeStatus(actor, id, "closed");
  }

  reopen(actor: Actor, id: number) {
    const ticket = this.getRow(actor, id);
    if (ticket.status !== "resolved" && ticket.status !== "closed") {
      throw badRequest("Only resolved or closed tickets can be reopened");
    }
    return this.changeStatus(actor, id, "in_progress");
  }

  logActivity(ticketId: number, actorId: number | null, field: string, oldValue: string | null, newValue: string | null) {
    this.db.insert(activities).values({ ticketId, actorId, field, oldValue, newValue }).run();
  }

  private requireCategory(id: number, mustBeActive: boolean) {
    const category = this.db.select().from(categories).where(eq(categories.id, id)).get();
    if (!category || (mustBeActive && !category.active)) throw badRequest("Pick a category from the list");
  }

  private describe(field: string, value: unknown): string | null {
    if (value === null || value === undefined || value === "") return null;
    if (field === "categoryId") {
      return this.db.select().from(categories).where(eq(categories.id, Number(value))).get()?.name ?? null;
    }
    if (field === "urgency" || field === "priority") return URGENCY_LABELS[value as keyof typeof URGENCY_LABELS];
    if (field === "description") return null;
    return String(value);
  }
}

function preview(text: string, max = 140) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
