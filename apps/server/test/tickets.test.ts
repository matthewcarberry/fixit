import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { makeApp } from "./helpers";

let t: Awaited<ReturnType<typeof makeApp>>;
afterEach(() => t?.cleanup());

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function multipart(file: Buffer, filename: string, fields: Record<string, string> = {}) {
  const boundary = "----fixit" + Math.random().toString(16).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return { body: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

describe("tickets", () => {
  it("lets a requester submit without a category and shows it in Matt's queue", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const wife = await t.addRequester(admin, "Sam", "sam@example.com");
    const created = await t.call("POST", "/api/tickets", {
      cookie: wife,
      body: { title: "Wifi is down", description: "Nothing loads upstairs", urgency: "urgent" },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ number: "HOME-1", category: null, status: "new", priority: "urgent" });

    const queue = await t.call("GET", "/api/tickets", { cookie: admin });
    expect(queue.body.map((x: { title: string }) => x.title)).toEqual(["Wifi is down"]);

    const notes = await t.call("GET", "/api/notifications", { cookie: admin });
    expect(notes.body.unread).toBe(1);
    expect(notes.body.items[0].kind).toBe("ticket_created");
  });

  it("keeps requesters to their own tickets", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    const kid = await t.addRequester(admin, "Kid", "kid@example.com");
    await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "Sam's", description: "x" } });
    await t.call("POST", "/api/tickets", { cookie: kid, body: { title: "Kid's", description: "y" } });

    const kidList = await t.call("GET", "/api/tickets", { cookie: kid });
    expect(kidList.body.map((x: { title: string }) => x.title)).toEqual(["Kid's"]);
    expect((await t.call("GET", "/api/tickets/1", { cookie: kid })).status).toBe(404);
    expect((await t.call("POST", "/api/tickets/1/comments", { cookie: kid, body: { body: "hi" } })).status).toBe(404);
  });

  it("hides internal notes from the requester", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "Leak", description: "Under the sink" } });
    await t.call("POST", "/api/tickets/1/comments", { cookie: admin, body: { body: "Probably the P-trap", internal: true } });
    await t.call("POST", "/api/tickets/1/comments", { cookie: admin, body: { body: "On it tonight" } });

    const asSam = await t.call("GET", "/api/tickets/1", { cookie: sam });
    expect(asSam.body.comments.map((c: { body: string }) => c.body)).toEqual(["On it tonight"]);
    const asMatt = await t.call("GET", "/api/tickets/1", { cookie: admin });
    expect(asMatt.body.comments).toHaveLength(2);

    // A requester can't create internal notes even if they ask to.
    await t.call("POST", "/api/tickets/1/comments", { cookie: sam, body: { body: "Secret?", internal: true } });
    const again = await t.call("GET", "/api/tickets/1", { cookie: sam });
    expect(again.body.comments.at(-1)).toMatchObject({ body: "Secret?", internal: false });
  });

  it("only the admin can change status and priority", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "Ants", description: "Kitchen" } });
    expect((await t.call("PATCH", "/api/tickets/1", { cookie: sam, body: { status: "closed" } })).status).toBe(403);
    const r = await t.call("PATCH", "/api/tickets/1", {
      cookie: admin,
      body: { status: "in_progress", priority: "high", dueDate: "2026-11-01" },
    });
    expect(r.body).toMatchObject({ status: "in_progress", priority: "high", dueDate: "2026-11-01" });
    expect(r.body.activity.map((a: { field: string }) => a.field)).toEqual(["created", "priority", "dueDate", "status"]);
  });

  it("moves a waiting ticket back to in progress when the requester replies", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "Printer", description: "Offline" } });
    await t.call("PATCH", "/api/tickets/1", { cookie: admin, body: { status: "waiting_on_requester" } });
    await t.call("POST", "/api/tickets/1/comments", { cookie: sam, body: { body: "It's the one in the office" } });
    const r = await t.call("GET", "/api/tickets/1", { cookie: admin });
    expect(r.body.status).toBe("in_progress");
  });

  it("lets the requester confirm or reopen a resolved ticket", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "TV", description: "No sound" } });
    await t.call("PATCH", "/api/tickets/1", { cookie: admin, body: { status: "resolved" } });
    expect((await t.call("POST", "/api/tickets/1/reopen", { cookie: sam })).body.status).toBe("in_progress");
    await t.call("PATCH", "/api/tickets/1", { cookie: admin, body: { status: "resolved" } });
    expect((await t.call("POST", "/api/tickets/1/confirm", { cookie: sam })).body.status).toBe("closed");
  });

  it("searches titles, descriptions, comments and ticket numbers", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    await t.call("POST", "/api/tickets", { cookie: admin, body: { title: "Garage door", description: "Opener beeps" } });
    await t.call("POST", "/api/tickets", { cookie: admin, body: { title: "Router", description: "Slow" } });
    await t.call("POST", "/api/tickets/2/comments", { cookie: admin, body: { body: "Replace the mesh node" } });
    const find = async (q: string) =>
      (await t.call("GET", `/api/tickets?status=all&q=${encodeURIComponent(q)}`, { cookie: admin })).body.map(
        (x: { id: number }) => x.id,
      );
    expect(await find("beeps")).toEqual([1]);
    expect(await find("mesh")).toEqual([2]);
    expect(await find("HOME-2")).toEqual([2]);
  });

  it("accepts photos and rejects files that aren't images", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "Mold", description: "Bathroom ceiling" } });

    const good = multipart(PNG_1PX, "ceiling.png");
    const up = await t.app.inject({
      method: "POST",
      url: "/api/tickets/1/attachments",
      payload: good.body,
      headers: { ...good.headers, cookie: sam },
    });
    expect(up.statusCode).toBe(201);

    const bad = multipart(Buffer.from("#!/bin/sh\necho hi"), "evil.png");
    const rejected = await t.app.inject({
      method: "POST",
      url: "/api/tickets/1/attachments",
      payload: bad.body,
      headers: { ...bad.headers, cookie: sam },
    });
    expect(rejected.statusCode).toBe(400);

    const detail = await t.call("GET", "/api/tickets/1", { cookie: sam });
    expect(detail.body.attachments).toHaveLength(1);
    const file = await t.app.inject({ method: "GET", url: detail.body.attachments[0].url, headers: { cookie: sam } });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/png");

    const kid = await t.addRequester(admin, "Kid", "kid@example.com");
    const denied = await t.app.inject({ method: "GET", url: detail.body.attachments[0].url, headers: { cookie: kid } });
    expect(denied.statusCode).toBe(404);
  });
});

describe("deleting a person", () => {
  it("removes them, their tickets and photos, and what they wrote elsewhere", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    const kid = await t.addRequester(admin, "Alex", "alex@example.com");
    await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "Mold", description: "Bathroom ceiling" } });
    const photo = multipart(PNG_1PX, "ceiling.png");
    await t.app.inject({ method: "POST", url: "/api/tickets/1/attachments", payload: photo.body, headers: { ...photo.headers, cookie: sam } });
    await t.call("POST", "/api/tickets", { cookie: kid, body: { title: "Xbox", description: "Won't connect" } });
    await t.call("POST", "/api/tickets/2/comments", { cookie: admin, body: { body: "On it" } });
    await t.call("PATCH", "/api/tickets/1", { cookie: admin, body: { priority: "high" } });

    // Make Sam an admin so they can also leave a comment on Alex's ticket.
    await t.call("PATCH", "/api/users/2", { cookie: admin, body: { role: "admin" } });
    await t.call("POST", "/api/tickets/2/comments", { cookie: sam, body: { body: "Try restarting it" } });
    await t.call("PATCH", "/api/tickets/2", { cookie: sam, body: { status: "in_progress" } });

    const uploads = path.join(t.dataDir, "uploads", "1");
    expect(fs.readdirSync(uploads)).toHaveLength(1);

    expect((await t.call("DELETE", "/api/users/1", { cookie: admin })).status).toBe(400);
    const r = await t.call("DELETE", "/api/users/2", { cookie: admin });
    expect(r.status).toBe(200);
    expect(r.body.deletedTickets).toBe(1);

    expect((await t.call("GET", "/api/auth/me", { cookie: sam })).status).toBe(401);
    const people = await t.call("GET", "/api/users", { cookie: admin });
    expect(people.body.map((u: { name: string }) => u.name)).toEqual(["Matt", "Alex"]);
    expect((await t.call("GET", "/api/tickets/1", { cookie: admin })).status).toBe(404);
    expect(fs.existsSync(uploads)).toBe(false);

    const other = await t.call("GET", "/api/tickets/2", { cookie: admin });
    expect(other.status).toBe(200);
    expect(other.body.comments.map((c: { body: string }) => c.body)).toEqual(["On it"]);
    expect(other.body.status).toBe("in_progress");
  });

  it("only lets the admin delete people", async () => {
    t = await makeApp();
    const admin = await t.setupAdmin();
    const sam = await t.addRequester(admin, "Sam", "sam@example.com");
    await t.addRequester(admin, "Alex", "alex@example.com");
    expect((await t.call("DELETE", "/api/users/3", { cookie: sam })).status).toBe(403);
    expect((await t.call("DELETE", "/api/users/99", { cookie: admin })).status).toBe(404);
  });
});
