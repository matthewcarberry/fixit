import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import {
  changePasswordSchema,
  loginSchema,
  preferencesSchema,
  setupSchema,
  type PublicUser,
} from "@fixit/shared";
import type { AppContext } from "../app";
import { users, type UserRow } from "../db/schema";
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  deleteUserSessions,
  hashPassword,
  verifyPassword,
} from "../lib/auth";
import { HttpError, badRequest } from "../lib/errors";

export function toPublicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active,
    notifyPush: u.notifyPush,
    notifyEmail: u.notifyEmail,
    createdAt: u.createdAt,
  };
}

// A real hash to compare against when the email doesn't exist, so timing doesn't reveal accounts.
let dummyHash: Promise<string> | null = null;

export function authRoutes(ctx: AppContext) {
  const { db, config } = ctx;

  const secure = (req: FastifyRequest) =>
    config.secureCookies === "true" || (config.secureCookies === "auto" && req.protocol === "https");

  const startSession = (req: FastifyRequest, reply: FastifyReply, user: UserRow) => {
    const token = createSession(db, user.id, req.headers["user-agent"], config.sessionDays);
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secure(req),
      path: "/",
      maxAge: config.sessionDays * 86_400,
    });
  };

  return async function (app: FastifyInstance) {
    app.post(
      "/setup",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const input = setupSchema.parse(req.body);
        const passwordHash = await hashPassword(input.password);
        // Checked inside a transaction so two racing setup requests can't both create an admin.
        const user = db.transaction((tx) => {
          if (tx.select({ id: users.id }).from(users).limit(1).get()) return null;
          return tx
            .insert(users)
            .values({ name: input.name, email: input.email, role: "admin", passwordHash })
            .returning()
            .get();
        });
        if (!user) throw new HttpError(409, "already_setup", "Setup is already done. Sign in instead.");
        startSession(req, reply, user);
        return { user: toPublicUser(user) };
      },
    );

    app.post(
      "/auth/login",
      { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const input = loginSchema.parse(req.body);
        const keys = [`email:${input.email}`, `ip:${req.ip}`];
        const wait = ctx.throttle.lockedFor(keys);
        if (wait > 0) {
          throw new HttpError(
            429,
            "locked",
            `Too many failed sign-ins. Try again in ${Math.ceil(wait / 60_000)} minute(s).`,
          );
        }
        const user = db.select().from(users).where(eq(users.email, input.email)).get();
        dummyHash ??= hashPassword("not-a-real-password");
        const ok = await verifyPassword(user?.passwordHash ?? (await dummyHash), input.password);
        if (!user || !ok || !user.active) {
          ctx.throttle.fail(keys);
          throw new HttpError(401, "bad_credentials", "That email and password don't match");
        }
        ctx.throttle.succeed(keys);
        startSession(req, reply, user);
        return { user: toPublicUser(user) };
      },
    );

    app.post("/auth/logout", async (req, reply) => {
      const token = req.cookies[SESSION_COOKIE];
      if (token) deleteSession(db, token);
      reply.clearCookie(SESSION_COOKIE, { path: "/" });
      return { ok: true };
    });

    app.get("/auth/me", async (req) => {
      const user = ctx.requireUser(req);
      return { user: toPublicUser(user) };
    });

    app.post("/auth/password", async (req, reply) => {
      const user = ctx.requireUser(req);
      const input = changePasswordSchema.parse(req.body);
      if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
        throw badRequest("Your current password isn't right");
      }
      db.update(users)
        .set({ passwordHash: await hashPassword(input.newPassword) })
        .where(eq(users.id, user.id))
        .run();
      // Sign out every other device, keep this one signed in with a fresh session.
      deleteUserSessions(db, user.id);
      startSession(req, reply, user);
      return { ok: true };
    });

    app.patch("/me", async (req) => {
      const user = ctx.requireUser(req);
      const input = preferencesSchema.parse(req.body);
      if (Object.keys(input).length === 0) return { user: toPublicUser(user) };
      const updated = db.update(users).set(input).where(eq(users.id, user.id)).returning().get();
      return { user: toPublicUser(updated) };
    });
  };
}
