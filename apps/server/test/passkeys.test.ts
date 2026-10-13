import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "./helpers";
import { SoftAuthenticator } from "./softAuthenticator";

const ORIGIN = "https://fixit.example";

let t: Awaited<ReturnType<typeof makeApp>>;
afterEach(() => t?.cleanup());

const challengeCookie = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers["set-cookie"];
  const all = Array.isArray(raw) ? raw : [String(raw)];
  return all.find((c) => c.startsWith("fixit_webauthn="))!.split(";")[0]!;
};

async function addPasskey(session: string, device = new SoftAuthenticator(ORIGIN)) {
  const options = await t.call("POST", "/api/auth/passkeys/options", { cookie: session });
  expect(options.status).toBe(200);
  const saved = await t.call("POST", "/api/auth/passkeys", {
    cookie: `${session}; ${challengeCookie(options.res)}`,
    body: { response: device.register(options.body) },
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1" },
  });
  return { device, saved };
}

async function signInWith(device: SoftAuthenticator, overrides: { origin?: string } = {}) {
  const options = await t.call("POST", "/api/auth/passkey/options");
  return t.call("POST", "/api/auth/passkey/login", {
    cookie: challengeCookie(options.res),
    body: { response: device.signIn(options.body, overrides) },
  });
}

describe("passkeys", () => {
  it("adds a passkey and signs in with it instead of a password", async () => {
    t = await makeApp({ publicUrl: ORIGIN });
    const admin = await t.setupAdmin();
    const { device, saved } = await addPasskey(admin);
    expect(saved.status).toBe(201);
    expect(saved.body.passkey).toMatchObject({ name: "iPhone", lastUsedAt: null });

    const login = await signInWith(device);
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ email: "matt@example.com" });
    const session = login.res.headers["set-cookie"];
    expect(String(session)).toContain("fixit_session=");

    const list = await t.call("GET", "/api/auth/passkeys", { cookie: admin });
    expect(list.body.passkeys).toHaveLength(1);
    expect(list.body.passkeys[0].lastUsedAt).not.toBeNull();
  });

  it("rejects a passkey used on another site, an unknown passkey, and a reused challenge", async () => {
    t = await makeApp({ publicUrl: ORIGIN });
    const admin = await t.setupAdmin();
    const { device } = await addPasskey(admin);

    expect((await signInWith(device, { origin: "https://evil.example" })).status).toBe(401);
    expect((await signInWith(new SoftAuthenticator(ORIGIN))).status).toBe(401);

    const options = await t.call("POST", "/api/auth/passkey/options");
    const cookie = challengeCookie(options.res);
    const first = await t.call("POST", "/api/auth/passkey/login", { cookie, body: { response: device.signIn(options.body) } });
    expect(first.status).toBe(200);
    const replay = await t.call("POST", "/api/auth/passkey/login", { cookie, body: { response: device.signIn(options.body) } });
    expect(replay.status).toBe(400);
  });

  it("only lets people see, rename and remove their own passkeys", async () => {
    t = await makeApp({ publicUrl: ORIGIN });
    const admin = await t.setupAdmin();
    const wife = await t.addRequester(admin, "Sam", "sam@example.com");
    const { saved } = await addPasskey(admin);
    const id = saved.body.passkey.id;

    expect((await t.call("GET", "/api/auth/passkeys", { cookie: wife })).body.passkeys).toHaveLength(0);
    expect((await t.call("PATCH", `/api/auth/passkeys/${id}`, { cookie: wife, body: { name: "Mine" } })).status).toBe(404);
    expect((await t.call("DELETE", `/api/auth/passkeys/${id}`, { cookie: wife })).status).toBe(404);

    const renamed = await t.call("PATCH", `/api/auth/passkeys/${id}`, { cookie: admin, body: { name: "Matt's phone" } });
    expect(renamed.body.passkey.name).toBe("Matt's phone");
    expect((await t.call("DELETE", `/api/auth/passkeys/${id}`, { cookie: admin })).status).toBe(200);
    expect((await t.call("GET", "/api/auth/passkeys", { cookie: admin })).body.passkeys).toHaveLength(0);
  });

  it("removes someone's passkeys when the admin resets their password, and refuses deactivated people", async () => {
    t = await makeApp({ publicUrl: ORIGIN });
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    const me = await t.call("GET", "/api/auth/me", { cookie: sam });
    const samId = me.body.user.id;

    const { device } = await addPasskey(sam);
    await t.call("PATCH", `/api/users/${samId}`, { cookie: admin, body: { active: false } });
    expect((await signInWith(device)).status).toBe(401);
    await t.call("PATCH", `/api/users/${samId}`, { cookie: admin, body: { active: true, password: "a fresh start 123" } });
    expect((await signInWith(device)).status).toBe(401);
    expect(t.ctx.db.$client.prepare("select count(*) as n from passkeys").get()).toEqual({ n: 0 });
  });

  it("needs a challenge from this browser before adding a passkey", async () => {
    t = await makeApp({ publicUrl: ORIGIN });
    const admin = await t.setupAdmin();
    const device = new SoftAuthenticator(ORIGIN);
    const r = await t.call("POST", "/api/auth/passkeys", {
      cookie: admin,
      body: { response: device.register({ challenge: "made-up", rp: { id: "fixit.example" } }) },
    });
    expect(r.status).toBe(400);
  });
});
