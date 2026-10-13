import crypto from "node:crypto";
import argon2 from "argon2";
import { and, eq, gt, lt } from "drizzle-orm";
import type { DB } from "../db";
import { sessions, users, type UserRow } from "../db/schema";
import { addDays, nowIso } from "./time";

export const SESSION_COOKIE = "fixit_session";

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export function createSession(db: DB, userId: number, userAgent: string | undefined, days: number): string {
  const token = crypto.randomBytes(32).toString("base64url");
  db.insert(sessions)
    .values({
      tokenHash: sha256(token),
      userId,
      userAgent: userAgent?.slice(0, 300) ?? null,
      expiresAt: addDays(new Date(), days).toISOString(),
    })
    .run();
  return token;
}

/** Returns the signed-in user for a session token, extending the session as it is used. */
export function userForSession(db: DB, token: string, days: number): UserRow | null {
  const now = new Date();
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, nowIso(now))))
    .get();
  if (!row || !row.user.active) return null;

  // Sliding expiry: refresh at most once an hour to avoid a write on every request.
  if (now.getTime() - new Date(row.session.lastSeenAt).getTime() > 3_600_000) {
    db.update(sessions)
      .set({ lastSeenAt: nowIso(now), expiresAt: addDays(now, days).toISOString() })
      .where(eq(sessions.id, row.session.id))
      .run();
  }
  return row.user;
}

export function deleteSession(db: DB, token: string) {
  db.delete(sessions).where(eq(sessions.tokenHash, sha256(token))).run();
}

export function deleteUserSessions(db: DB, userId: number) {
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function pruneExpiredSessions(db: DB) {
  db.delete(sessions).where(lt(sessions.expiresAt, nowIso())).run();
}

/**
 * Tracks failed sign-ins per email and per IP. After `maxFailures` failures the key is
 * locked for `lockMinutes`, which blunts password guessing from the internet.
 */
export class LoginThrottle {
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly maxFailures = 5,
    private readonly lockMinutes = 15,
  ) {}

  lockedFor(keys: string[]): number {
    const now = Date.now();
    let wait = 0;
    for (const key of keys) {
      const entry = this.failures.get(key);
      if (entry && entry.lockedUntil > now) wait = Math.max(wait, entry.lockedUntil - now);
    }
    return wait;
  }

  fail(keys: string[]) {
    const now = Date.now();
    for (const key of keys) {
      const entry = this.failures.get(key) ?? { count: 0, lockedUntil: 0 };
      if (entry.lockedUntil && entry.lockedUntil <= now) {
        entry.count = 0;
        entry.lockedUntil = 0;
      }
      entry.count += 1;
      if (entry.count >= this.maxFailures) entry.lockedUntil = now + this.lockMinutes * 60_000;
      this.failures.set(key, entry);
    }
  }

  succeed(keys: string[]) {
    for (const key of keys) this.failures.delete(key);
  }
}
