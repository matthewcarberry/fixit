import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { Passkey, PublicUser } from "@fixit/shared";
import { api } from "./api";

/** Browsers only offer passkeys on https (or localhost), so a plain http LAN address hides them. */
export const passkeysSupported = () => browserSupportsWebAuthn();

/** True when the person closed the passkey prompt; that isn't worth an error message. */
const cancelled = (err: unknown) => err instanceof Error && (err.name === "NotAllowedError" || err.name === "AbortError");

export async function addPasskey(): Promise<Passkey | null> {
  const optionsJSON = await api.post<Parameters<typeof startRegistration>[0]["optionsJSON"]>("/api/auth/passkeys/options");
  let response;
  try {
    response = await startRegistration({ optionsJSON });
  } catch (err) {
    if (cancelled(err)) return null;
    if ((err as { code?: string }).code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
      throw new Error("This device already has a passkey for Fixit.");
    }
    throw new Error("This device couldn't make a passkey.");
  }
  return (await api.post<{ passkey: Passkey }>("/api/auth/passkeys", { response })).passkey;
}

export async function signInWithPasskey(): Promise<PublicUser | null> {
  const optionsJSON = await api.post<Parameters<typeof startAuthentication>[0]["optionsJSON"]>("/api/auth/passkey/options");
  let response;
  try {
    response = await startAuthentication({ optionsJSON });
  } catch (err) {
    if (cancelled(err)) return null;
    throw new Error("This device couldn't use a passkey.");
  }
  return (await api.post<{ user: PublicUser }>("/api/auth/passkey/login", { response })).user;
}
