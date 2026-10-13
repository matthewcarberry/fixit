import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { passkeyNameSchema, type Passkey } from "@fixit/shared";
import type { AppContext } from "../app";
import { passkeys, users, type PasskeyRow } from "../db/schema";
import { CHALLENGE_COOKIE, deviceName, relyingParty } from "../lib/passkeys";
import { HttpError, badRequest, notFound } from "../lib/errors";
import { nowIso } from "../lib/time";
import { startSession, toPublicUser, useSecureCookies } from "./auth";

const idParam = z.object({ id: z.coerce.number().int().positive() });
// The library checks the rest of the response; this only rejects obvious junk early.
const credentialBody = z.object({
  response: z.looseObject({ id: z.string().min(1).max(1024), type: z.literal("public-key") }),
});

const toPasskey = (p: PasskeyRow): Passkey => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt,
  lastUsedAt: p.lastUsedAt,
});

const signInFailed = () => new HttpError(401, "passkey_failed", "That passkey didn't work. Try again or use your password.");

export function passkeyRoutes(ctx: AppContext) {
  const { db, config, challenges } = ctx;

  const rememberChallenge = (req: FastifyRequest, reply: FastifyReply, challenge: string, userId: number | null) => {
    reply.setCookie(CHALLENGE_COOKIE, challenges.put(challenge, userId), {
      httpOnly: true,
      sameSite: "strict",
      secure: useSecureCookies(ctx, req),
      path: "/api/auth",
      maxAge: challenges.ttlSeconds,
    });
  };

  const takeChallenge = (req: FastifyRequest, reply: FastifyReply, userId: number | null) => {
    reply.clearCookie(CHALLENGE_COOKIE, { path: "/api/auth" });
    return challenges.take(req.cookies[CHALLENGE_COOKIE], userId);
  };

  const ownPasskey = (userId: number, id: number) => {
    const row = db
      .select()
      .from(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
      .get();
    if (!row) throw notFound("That passkey");
    return row;
  };

  return async function (app: FastifyInstance) {
    app.get("/auth/passkeys", async (req) => {
      const user = ctx.requireUser(req);
      const rows = db.select().from(passkeys).where(eq(passkeys.userId, user.id)).orderBy(asc(passkeys.id)).all();
      return { passkeys: rows.map(toPasskey) };
    });

    app.post("/auth/passkeys/options", async (req, reply) => {
      const user = ctx.requireUser(req);
      const { rpID } = relyingParty(config, req);
      const existing = db.select().from(passkeys).where(eq(passkeys.userId, user.id)).all();
      const options = await generateRegistrationOptions({
        rpName: "Fixit",
        rpID,
        userID: new TextEncoder().encode(`fixit-user-${user.id}`),
        userName: user.email,
        userDisplayName: user.name,
        attestationType: "none",
        // Don't let the same device register twice.
        excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: parseTransports(p.transports) })),
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      });
      rememberChallenge(req, reply, options.challenge, user.id);
      return options;
    });

    app.post("/auth/passkeys", async (req, reply) => {
      const user = ctx.requireUser(req);
      const { response } = credentialBody.parse(req.body);
      const expectedChallenge = takeChallenge(req, reply, user.id);
      if (!expectedChallenge) throw badRequest("That took too long. Try adding the passkey again.");
      const { rpID, origin } = relyingParty(config, req);
      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: response as unknown as RegistrationResponseJSON,
          expectedChallenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: false,
        });
      } catch (err) {
        req.log.warn({ err }, "passkey registration rejected");
        throw badRequest("That passkey couldn't be added. Try again.");
      }
      if (!verification.verified) throw badRequest("That passkey couldn't be added. Try again.");
      const { credential } = verification.registrationInfo;
      if (db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.credentialId, credential.id)).get()) {
        throw badRequest("That passkey is already added");
      }
      const row = db
        .insert(passkeys)
        .values({
          userId: user.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString("base64url"),
          counter: credential.counter,
          transports: credential.transports ? JSON.stringify(credential.transports) : null,
          name: deviceName(req.headers["user-agent"]),
        })
        .returning()
        .get();
      reply.status(201);
      return { passkey: toPasskey(row) };
    });

    app.patch("/auth/passkeys/:id", async (req) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      const { name } = passkeyNameSchema.parse(req.body);
      ownPasskey(user.id, id);
      const row = db.update(passkeys).set({ name }).where(eq(passkeys.id, id)).returning().get();
      return { passkey: toPasskey(row) };
    });

    app.delete("/auth/passkeys/:id", async (req) => {
      const user = ctx.requireUser(req);
      const { id } = idParam.parse(req.params);
      ownPasskey(user.id, id);
      db.delete(passkeys).where(eq(passkeys.id, id)).run();
      return { ok: true };
    });

    app.post(
      "/auth/passkey/options",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const { rpID } = relyingParty(config, req);
        // No allowCredentials: the device offers whichever Fixit passkeys it holds.
        const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
        rememberChallenge(req, reply, options.challenge, null);
        return options;
      },
    );

    app.post(
      "/auth/passkey/login",
      { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const keys = [`ip:${req.ip}`];
        const wait = ctx.throttle.lockedFor(keys);
        if (wait > 0) {
          throw new HttpError(429, "locked", `Too many failed sign-ins. Try again in ${Math.ceil(wait / 60_000)} minute(s).`);
        }
        const { response } = credentialBody.parse(req.body);
        const expectedChallenge = takeChallenge(req, reply, null);
        if (!expectedChallenge) throw badRequest("That took too long. Try signing in again.");

        const found = db
          .select({ passkey: passkeys, user: users })
          .from(passkeys)
          .innerJoin(users, eq(users.id, passkeys.userId))
          .where(eq(passkeys.credentialId, response.id))
          .get();
        if (!found || !found.user.active) {
          ctx.throttle.fail(keys);
          throw signInFailed();
        }

        const { rpID, origin } = relyingParty(config, req);
        let verification;
        try {
          verification = await verifyAuthenticationResponse({
            response: response as unknown as AuthenticationResponseJSON,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
              id: found.passkey.credentialId,
              publicKey: Buffer.from(found.passkey.publicKey, "base64url"),
              counter: found.passkey.counter,
              transports: parseTransports(found.passkey.transports),
            },
            requireUserVerification: false,
          });
        } catch (err) {
          req.log.warn({ err }, "passkey sign-in rejected");
          verification = null;
        }
        if (!verification?.verified) {
          ctx.throttle.fail(keys);
          throw signInFailed();
        }

        db.update(passkeys)
          .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: nowIso() })
          .where(eq(passkeys.id, found.passkey.id))
          .run();
        ctx.throttle.succeed(keys);
        startSession(ctx, req, reply, found.user);
        return { user: toPublicUser(found.user) };
      },
    );
  };
}

function parseTransports(value: string | null): string[] | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : undefined;
  } catch {
    return undefined;
  }
}
