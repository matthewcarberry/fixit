import fs from "node:fs";
import path from "node:path";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { asc, eq } from "drizzle-orm";
import { emailEnabled, type Config } from "./config";
import { openDatabase, type DB } from "./db";
import { users, type UserRow } from "./db/schema";
import { HttpError, forbidden, unauthorized } from "./lib/errors";
import { LoginThrottle, SESSION_COOKIE, userForSession } from "./lib/auth";
import { EmailService } from "./services/email";
import { Notifier } from "./services/notifier";
import { PushService } from "./services/push";
import { Scheduler } from "./services/scheduler";
import { TicketService } from "./services/tickets";
import { authRoutes } from "./routes/auth";
import { ticketRoutes } from "./routes/tickets";
import { adminRoutes } from "./routes/admin";
import { notificationRoutes } from "./routes/notifications";
import { passkeyRoutes } from "./routes/passkeys";
import { ChallengeStore } from "./lib/passkeys";

declare module "fastify" {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

export interface AppContext {
  config: Config;
  db: DB;
  tickets: TicketService;
  notifier: Notifier;
  push: PushService;
  email: EmailService;
  scheduler: Scheduler;
  throttle: LoginThrottle;
  challenges: ChallengeStore;
  requireUser(req: FastifyRequest): UserRow;
  requireAdmin(req: FastifyRequest): UserRow;
  needsSetup(): boolean;
}

export async function buildApp(config: Config, opts: { logger?: boolean; dbFile?: string } = {}) {
  const app = Fastify({
    logger: opts.logger ?? true,
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  const db = openDatabase(opts.dbFile ?? path.join(config.dataDir, "fixit.db"));
  const firstAdminEmail = () =>
    db.select({ email: users.email }).from(users).where(eq(users.role, "admin")).orderBy(asc(users.id)).get()?.email;
  const push = new PushService(
    db,
    () => {
      if (config.publicUrl.startsWith("https://")) return config.publicUrl;
      // Push services (Apple's in particular) reject placeholder contacts, so use the admin's address.
      return `mailto:${firstAdminEmail() ?? "admin@example.com"}`;
    },
    app.log,
  );
  const email = new EmailService(config, app.log);
  const notifier = new Notifier(db, config, push, email);
  const ticketService = new TicketService(db, config, notifier);
  const scheduler = new Scheduler(db, config, ticketService, notifier, app.log);

  const ctx: AppContext = {
    config,
    db,
    tickets: ticketService,
    notifier,
    push,
    email,
    scheduler,
    throttle: new LoginThrottle(),
    challenges: new ChallengeStore(),
    requireUser(req) {
      if (!req.user) throw unauthorized();
      return req.user;
    },
    requireAdmin(req) {
      const user = ctx.requireUser(req);
      if (user.role !== "admin") throw forbidden("Only the admin can do that");
      return user;
    },
    needsSetup() {
      return !db.select({ id: users.id }).from(users).limit(1).get();
    },
  };

  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 10, fields: 5 },
  });

  app.decorateRequest("user", null);
  app.addHook("onRequest", async (req) => {
    const token = req.cookies[SESSION_COOKIE];
    req.user = token ? userForSession(db, token, config.sessionDays) : null;
  });

  // Someone signed in with a password the admin chose can only replace it (or sign out) until they do.
  const allowedBeforePasswordChange = new Set(["/api/auth/me", "/api/auth/password", "/api/auth/logout", "/api/info"]);
  app.addHook("onRequest", async (req) => {
    if (!req.user?.mustChangePassword) return;
    const path = req.url.split("?")[0]!;
    if (!path.startsWith("/api/") || allowedBeforePasswordChange.has(path)) return;
    throw new HttpError(403, "password_change_required", "Choose a new password to keep going");
  });

  // Cross-site request protection: browsers send Origin on POST/PATCH/DELETE; it must match our host.
  app.addHook("onRequest", async (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw forbidden("Bad request origin");
    }
    const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() || req.headers.host;
    if (originHost !== host) throw forbidden("Cross-site requests aren't allowed");
  });

  app.addHook("onSend", async (_req, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "same-origin");
    reply.header("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
    const type = String(reply.getHeader("content-type") ?? "");
    if (type.startsWith("text/html")) {
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
          "connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    }
    return payload;
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "_";
        fields[key] ??= issue.message;
      }
      return reply.status(400).send({ error: "invalid", message: Object.values(fields)[0] ?? "Check the form", fields });
    }
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send({ error: error.code, message: error.message });
    }
    const tooLarge = (error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE";
    const status = tooLarge ? 413 : ((error as { statusCode?: number }).statusCode ?? 500);
    if (status >= 500) req.log.error({ err: error }, "request failed");
    const message = tooLarge
      ? `Photos must be under ${config.maxUploadMb} MB`
      : status === 429
        ? "Too many attempts. Wait a few minutes and try again."
        : status >= 500
          ? "Something went wrong on the server"
          : (error as Error).message;
    return reply.status(status).send({ error: "error", message });
  });

  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/info", async () => ({
    needsSetup: ctx.needsSetup(),
    version: config.version,
    ticketPrefix: config.ticketPrefix,
    emailEnabled: emailEnabled(config),
    pushEnabled: true,
  }));

  await app.register(authRoutes(ctx), { prefix: "/api" });
  await app.register(passkeyRoutes(ctx), { prefix: "/api" });
  await app.register(ticketRoutes(ctx), { prefix: "/api" });
  await app.register(adminRoutes(ctx), { prefix: "/api" });
  await app.register(notificationRoutes(ctx), { prefix: "/api" });

  // The built web app, with client-side routing fallback.
  if (fs.existsSync(path.join(config.webDir, "index.html"))) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      wildcard: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.header("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          res.header("Cache-Control", "no-cache");
        }
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || (req.method !== "GET" && req.method !== "HEAD")) {
        return reply.status(404).send({ error: "not_found", message: "Not found" });
      }
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    });
  }

  app.addHook("onClose", async () => {
    scheduler.stop();
    db.$client.close();
  });

  return { app: app as FastifyInstance, ctx };
}
