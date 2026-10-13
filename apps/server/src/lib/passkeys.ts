import crypto from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { Config } from "../config";

export const CHALLENGE_COOKIE = "fixit_webauthn";
const CHALLENGE_TTL_MS = 5 * 60_000;

/**
 * Where passkeys are scoped to. FIXIT_PUBLIC_URL wins when set; otherwise the address the
 * browser used, so a fresh install works before it is configured. Browsers only offer
 * passkeys over HTTPS (or on localhost), so plain http on a LAN address never gets this far.
 */
export function relyingParty(config: Config, req: FastifyRequest) {
  if (config.publicUrl) {
    const url = new URL(config.publicUrl);
    return { rpID: url.hostname, origin: url.origin };
  }
  const host = (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() || req.headers.host || "";
  const origin = `${req.protocol}://${host}`;
  return { rpID: new URL(origin).hostname, origin };
}

/**
 * Holds the challenge for a passkey ceremony between its two requests. The browser keeps only
 * a random handle in a short-lived cookie; each challenge can be used once.
 */
export class ChallengeStore {
  private entries = new Map<string, { challenge: string; userId: number | null; expiresAt: number }>();

  put(challenge: string, userId: number | null): string {
    this.prune();
    const handle = crypto.randomBytes(24).toString("base64url");
    this.entries.set(handle, { challenge, userId, expiresAt: Date.now() + CHALLENGE_TTL_MS });
    return handle;
  }

  take(handle: string | undefined, userId: number | null): string | null {
    if (!handle) return null;
    const entry = this.entries.get(handle);
    this.entries.delete(handle);
    if (!entry || entry.expiresAt < Date.now() || entry.userId !== userId) return null;
    return entry.challenge;
  }

  get ttlSeconds() {
    return CHALLENGE_TTL_MS / 1000;
  }

  private prune() {
    const now = Date.now();
    for (const [handle, entry] of this.entries) if (entry.expiresAt < now) this.entries.delete(handle);
  }
}

/** A friendly default name such as "iPhone" or "Chrome on Windows", from the browser's user agent. */
export function deviceName(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Macintosh|Mac OS X/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /CrOS/.test(ua)
              ? "Chromebook"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
  if (device === "iPhone" || device === "iPad" || device === "Android") return device;
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  if (device && browser) return `${browser} on ${device}`;
  return device ?? browser ?? "Passkey";
}
