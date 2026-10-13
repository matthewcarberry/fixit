import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { CreatedUser, WelcomeEmailResult } from "@fixit/shared";
import { asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { categorySchema, createUserSchema, updateCategorySchema, updateUserSchema } from "@fixit/shared";
import type { AppContext } from "../app";
import { activities, attachments, categories, comments, passkeys, tickets, users, type UserRow } from "../db/schema";
import { deleteUserSessions, hashPassword } from "../lib/auth";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { toPublicUser } from "./auth";

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function adminRoutes(ctx: AppContext) {
  const { db, config, email } = ctx;

  const sendWelcome = async (user: UserRow, admin: UserRow, password: string): Promise<WelcomeEmailResult> => {
    if (!email.enabled) return "not_configured";
    const where = config.publicUrl ? `Sign in at ${config.publicUrl}` : `Ask ${admin.name} for the address to sign in at`;
    const text = [
      `Hi ${user.name},`,
      "",
      `${admin.name} set up a Fixit account for you. Use it to report anything around the house that needs fixing.`,
      "",
      `${where} with:`,
      `  Email: ${user.email}`,
      `  Starting password: ${password}`,
      "",
      "The first time you sign in, you'll be asked to choose your own password.",
      "",
    ].join("\n");
    return (await email.send(user.email, "Your Fixit account is ready", text)) ? "sent" : "failed";
  };

  return async function (app: FastifyInstance) {
    app.get("/users", async (req) => {
      ctx.requireAdmin(req);
      return db.select().from(users).orderBy(asc(users.id)).all().map(toPublicUser);
    });

    app.post("/users", async (req, reply) => {
      const admin = ctx.requireAdmin(req);
      const input = createUserSchema.parse(req.body);
      if (db.select().from(users).where(eq(users.email, input.email)).get()) {
        throw new HttpError(409, "exists", "Someone already uses that email");
      }
      const user = db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          role: input.role,
          passwordHash: await hashPassword(input.password),
          mustChangePassword: true,
        })
        .returning()
        .get();
      const welcomeEmail = await sendWelcome(user, admin, input.password);
      reply.status(201);
      return { user: toPublicUser(user), welcomeEmail } satisfies CreatedUser;
    });

    app.patch("/users/:id", async (req) => {
      const admin = ctx.requireAdmin(req);
      const { id } = idParam.parse(req.params);
      const input = updateUserSchema.parse(req.body);
      const target = db.select().from(users).where(eq(users.id, id)).get();
      if (!target) throw notFound("That person");
      if (id === admin.id && (input.active === false || input.role === "requester")) {
        throw badRequest("You can't remove your own admin access");
      }
      const { password, ...rest } = input;
      const changes: Partial<typeof users.$inferInsert> = { ...rest };
      if (password) {
        changes.passwordHash = await hashPassword(password);
        // A password the admin picked is temporary; they choose their own at next sign-in.
        if (id !== admin.id) changes.mustChangePassword = true;
      }
      if (Object.keys(changes).length === 0) return toPublicUser(target);
      const updated = db.update(users).set(changes).where(eq(users.id, id)).returning().get();
      if (password || input.active === false) deleteUserSessions(db, id);
      // A reset usually means they lost access, maybe with a lost phone, so its passkeys go too.
      if (password && id !== admin.id) db.delete(passkeys).where(eq(passkeys.userId, id)).run();
      return toPublicUser(updated);
    });

    /**
     * Deletes a person for good: their account, every ticket they reported (with its photos,
     * comments and history) and anything they wrote on other people's tickets.
     */
    app.delete("/users/:id", async (req) => {
      const admin = ctx.requireAdmin(req);
      const { id } = idParam.parse(req.params);
      if (id === admin.id) throw badRequest("You can't delete your own account");
      const target = db.select().from(users).where(eq(users.id, id)).get();
      if (!target) throw notFound("That person");

      const uploadRoot = path.join(config.dataDir, "uploads");
      const { ticketIds, photos } = db.transaction((tx) => {
        const ticketIds = tx
          .select({ id: tickets.id })
          .from(tickets)
          .where(eq(tickets.requesterId, id))
          .all()
          .map((t) => t.id);
        const commentIds = tx
          .select({ id: comments.id })
          .from(comments)
          .where(eq(comments.authorId, id))
          .all()
          .map((c) => c.id);
        // Photos they uploaded, or attached to their comments, on tickets that stay.
        const photos = tx
          .select({ id: attachments.id, ticketId: attachments.ticketId, storedName: attachments.storedName })
          .from(attachments)
          .where(
            or(
              eq(attachments.uploadedBy, id),
              commentIds.length ? inArray(attachments.commentId, commentIds) : undefined,
            ),
          )
          .all()
          .filter((a) => !ticketIds.includes(a.ticketId));

        if (photos.length) tx.delete(attachments).where(inArray(attachments.id, photos.map((a) => a.id))).run();
        tx.delete(comments).where(eq(comments.authorId, id)).run();
        // History of changes they made on other tickets stays, without their name.
        tx.update(activities).set({ actorId: null }).where(eq(activities.actorId, id)).run();
        // Their own tickets take their comments, photos, history and notifications with them.
        if (ticketIds.length) tx.delete(tickets).where(inArray(tickets.id, ticketIds)).run();
        // Sessions, notifications and push subscriptions go with the account.
        tx.delete(users).where(eq(users.id, id)).run();
        return { ticketIds, photos };
      });

      for (const ticketId of ticketIds) {
        fs.rmSync(path.join(uploadRoot, String(ticketId)), { recursive: true, force: true });
      }
      for (const photo of photos) {
        fs.rmSync(path.join(uploadRoot, String(photo.ticketId), photo.storedName), { force: true });
      }
      return { ok: true, deletedTickets: ticketIds.length };
    });

    app.post("/users/:id/signout", async (req) => {
      ctx.requireAdmin(req);
      const { id } = idParam.parse(req.params);
      deleteUserSessions(db, id);
      return { ok: true };
    });

    app.post("/categories", async (req, reply) => {
      ctx.requireAdmin(req);
      const input = categorySchema.parse(req.body);
      const last = db.select().from(categories).orderBy(asc(categories.sortOrder)).all().at(-1);
      const row = db
        .insert(categories)
        .values({ ...input, sortOrder: input.sortOrder ?? (last ? last.sortOrder + 1 : 0) })
        .returning()
        .get();
      reply.status(201);
      return row;
    });

    app.patch("/categories/:id", async (req) => {
      ctx.requireAdmin(req);
      const { id } = idParam.parse(req.params);
      const input = updateCategorySchema.parse(req.body);
      const existing = db.select().from(categories).where(eq(categories.id, id)).get();
      if (!existing) throw notFound("That category");
      if (Object.keys(input).length === 0) return existing;
      return db.update(categories).set(input).where(eq(categories.id, id)).returning().get();
    });
  };
}
