import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { pushSubscriptionSchema, type AppNotification } from "@fixit/shared";
import type { AppContext } from "../app";
import { notifications, pushSubscriptions } from "../db/schema";
import { nowIso } from "../lib/time";

export function notificationRoutes(ctx: AppContext) {
  const { db } = ctx;

  return async function (app: FastifyInstance) {
    app.get("/notifications", async (req) => {
      const user = ctx.requireUser(req);
      const rows = db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, user.id))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(100)
        .all();
      const unread = db
        .select({ n: sql<number>`count(*)` })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
        .get();
      const items: AppNotification[] = rows.map((n) => ({
        id: n.id,
        ticketId: n.ticketId,
        ticketNumber: n.ticketId ? ctx.tickets.number(n.ticketId) : null,
        kind: n.kind,
        message: n.message,
        read: n.readAt !== null,
        createdAt: n.createdAt,
      }));
      return { unread: unread?.n ?? 0, items };
    });

    app.post("/notifications/read", async (req) => {
      const user = ctx.requireUser(req);
      const body = z
        .object({ ids: z.array(z.number().int()).max(500).optional(), ticketId: z.number().int().optional() })
        .parse(req.body ?? {});
      const conditions = [eq(notifications.userId, user.id), isNull(notifications.readAt)];
      if (body.ticketId) conditions.push(eq(notifications.ticketId, body.ticketId));
      if (body.ids) conditions.push(inArray(notifications.id, body.ids.length ? body.ids : [-1]));
      db.update(notifications)
        .set({ readAt: nowIso() })
        .where(and(...conditions))
        .run();
      return { ok: true };
    });

    app.get("/push/key", async (req) => {
      ctx.requireUser(req);
      return { publicKey: ctx.push.publicKey };
    });

    app.post("/push/subscribe", async (req) => {
      const user = ctx.requireUser(req);
      const sub = pushSubscriptionSchema.parse(req.body);
      db.insert(pushSubscriptions)
        .values({ userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        })
        .run();
      return { ok: true };
    });

    app.post("/push/unsubscribe", async (req) => {
      const user = ctx.requireUser(req);
      const { endpoint } = z.object({ endpoint: z.string().max(2000) }).parse(req.body);
      db.delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)))
        .run();
      return { ok: true };
    });
  };
}
