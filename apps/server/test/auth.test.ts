import { afterEach, describe, expect, it, vi } from "vitest";
import { makeApp } from "./helpers";

let t: Awaited<ReturnType<typeof makeApp>>;
afterEach(() => t?.cleanup());

describe("first-run setup and sign-in", () => {
  it("creates the admin once, then refuses a second setup", async () => {
    t = await makeApp();
    expect((await t.call("GET", "/api/info")).body.needsSetup).toBe(true);
    const cookie = await t.setupAdmin();
    expect((await t.call("GET", "/api/info")).body.needsSetup).toBe(false);
    const me = await t.call("GET", "/api/auth/me", { cookie });
    expect(me.body.user).toMatchObject({ name: "Matt", role: "admin" });

    const again = await t.call("POST", "/api/setup", {
      body: { name: "Eve", email: "eve@example.com", password: "another long password" },
    });
    expect(again.status).toBe(409);
  });

  it("rejects short passwords at setup", async () => {
    t = await makeApp();
    const r = await t.call("POST", "/api/setup", { body: { name: "Matt", email: "m@example.com", password: "short" } });
    expect(r.status).toBe(400);
    expect(r.body.fields.password).toMatch(/10 characters/);
  });

  it("locks an account after five wrong passwords", async () => {
    t = await makeApp();
    await t.setupAdmin();
    for (let i = 0; i < 5; i++) {
      const r = await t.call("POST", "/api/auth/login", { body: { email: "matt@example.com", password: "wrong" } });
      expect(r.status).toBe(401);
    }
    const locked = await t.call("POST", "/api/auth/login", {
      body: { email: "matt@example.com", password: "correct horse battery" },
    });
    expect(locked.status).toBe(429);
  });

  it("requires sign-in for the API", async () => {
    t = await makeApp();
    expect((await t.call("GET", "/api/tickets")).status).toBe(401);
  });

  it("blocks cross-site form posts", async () => {
    t = await makeApp();
    const cookie = await t.setupAdmin();
    const r = await t.call("POST", "/api/tickets", {
      cookie,
      body: { title: "x", description: "y" },
      headers: { origin: "https://evil.example", host: "fixit.example" },
    });
    expect(r.status).toBe(403);
  });

  it("only lets the admin manage people", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const wife = await t.addRequester(admin, "Sam", "sam@example.com");
    expect((await t.call("GET", "/api/users", { cookie: wife })).status).toBe(403);
    expect((await t.call("GET", "/api/users", { cookie: admin })).body).toHaveLength(2);
  });

  it("signs a deactivated person out", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const wife = await t.addRequester(admin, "Sam", "sam@example.com");
    await t.call("PATCH", "/api/users/2", { cookie: admin, body: { active: false } });
    expect((await t.call("GET", "/api/auth/me", { cookie: wife })).status).toBe(401);
  });
});

describe("adding a person", () => {
  const smtp = { host: "smtp.example.com", port: 587, user: "", pass: "", from: "Fixit <fixit@example.com>", secure: false };
  const newPerson = { name: "Sam", email: "sam@example.com", password: "starting password" };

  it("emails the new person their sign-in details when email is set up", async () => {
    t = await makeApp({ smtp, publicUrl: "https://fixit.example.com" });
    const send = vi.spyOn(t.ctx.email, "send").mockResolvedValue(true);
    const admin = await t.setupAdmin();
    const r = await t.call("POST", "/api/users", { cookie: admin, body: newPerson });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ welcomeEmail: "sent", user: { email: "sam@example.com", mustChangePassword: true } });
    expect(send).toHaveBeenCalledOnce();
    const [to, subject, text] = send.mock.calls[0]!;
    expect(to).toBe("sam@example.com");
    expect(subject).toBe("Your Fixit account is ready");
    expect(text).toContain("Matt set up a Fixit account for you");
    expect(text).toContain("https://fixit.example.com");
    expect(text).toContain("starting password");
  });

  it("says when the email couldn't be sent", async () => {
    t = await makeApp({ smtp });
    vi.spyOn(t.ctx.email, "send").mockResolvedValue(false);
    const admin = await t.setupAdmin();
    const r = await t.call("POST", "/api/users", { cookie: admin, body: newPerson });
    expect(r.body.welcomeEmail).toBe("failed");
  });

  it("reports that no email went out when email isn't set up", async () => {
    t = await makeApp();
    const send = vi.spyOn(t.ctx.email, "send");
    const admin = await t.setupAdmin();
    const r = await t.call("POST", "/api/users", { cookie: admin, body: newPerson });
    expect(r.body.welcomeEmail).toBe("not_configured");
    expect(send).not.toHaveBeenCalled();
  });

  it("makes them choose their own password before anything else", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    await t.call("POST", "/api/users", { cookie: admin, body: newPerson });
    const login = await t.call("POST", "/api/auth/login", { body: { email: newPerson.email, password: newPerson.password } });
    expect(login.body.user.mustChangePassword).toBe(true);
    const cookie = String(login.res.headers["set-cookie"]).split(";")[0]!;

    expect((await t.call("GET", "/api/auth/me", { cookie })).status).toBe(200);
    const blocked = await t.call("GET", "/api/tickets", { cookie });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("password_change_required");

    const same = await t.call("POST", "/api/auth/password", {
      cookie,
      body: { currentPassword: newPerson.password, newPassword: newPerson.password },
    });
    expect(same.status).toBe(400);

    const changed = await t.call("POST", "/api/auth/password", {
      cookie,
      body: { currentPassword: newPerson.password, newPassword: "my own password" },
    });
    expect(changed.status).toBe(200);
    const fresh = String(changed.res.headers["set-cookie"]).split(";")[0]!;
    expect((await t.call("GET", "/api/auth/me", { cookie: fresh })).body.user.mustChangePassword).toBe(false);
    expect((await t.call("GET", "/api/tickets", { cookie: fresh })).status).toBe(200);
  });

  it("asks for a new password again after the admin resets it", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    await t.addRequester(admin, "Sam", "sam@example.com");
    const r = await t.call("PATCH", "/api/users/2", { cookie: admin, body: { password: "temporary password" } });
    expect(r.body.mustChangePassword).toBe(true);
  });

  it("doesn't ask the first admin to change the password they chose", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    expect((await t.call("GET", "/api/auth/me", { cookie: admin })).body.user.mustChangePassword).toBe(false);
  });
});
