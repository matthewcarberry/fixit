import { afterEach, describe, expect, it } from "vitest";
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
