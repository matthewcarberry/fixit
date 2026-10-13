import { afterEach, describe, expect, it } from "vitest";
import { hoursFromNow, makeApp } from "./helpers";

let t: Awaited<ReturnType<typeof makeApp>>;
afterEach(() => t?.cleanup());

async function ticketInStatus(status: string) {
  t = await makeApp();
  const admin = await t.setupAdmin();
  const sam = await t.addRequester(admin, "Sam", "sam@example.com");
  await t.call("POST", "/api/tickets", { cookie: sam, body: { title: "Wifi", description: "Down" } });
  await t.call("PATCH", "/api/tickets/1", { cookie: admin, body: { status } });
  const get = async () => (await t.call("GET", "/api/tickets/1", { cookie: admin })).body;
  const samNotes = async () => (await t.call("GET", "/api/notifications", { cookie: sam })).body.items;
  return { admin, sam, get, samNotes };
}

describe("resolved auto-close", () => {
  it("closes a resolved ticket after 2 days, not before", async () => {
    const { get } = await ticketInStatus("resolved");
    t.ctx.scheduler.runOnce(hoursFromNow(47));
    expect((await get()).status).toBe("resolved");
    t.ctx.scheduler.runOnce(hoursFromNow(48.01));
    const ticket = await get();
    expect(ticket.status).toBe("closed");
    expect(ticket.activity.some((a: { field: string }) => a.field === "auto_closed")).toBe(true);
  });
});

describe("waiting on requester", () => {
  it("pings every 24 hours, 5 pings in all, then closes at 5 days", async () => {
    const { get, samNotes } = await ticketInStatus("waiting_on_requester");
    const reminders = async () => (await samNotes()).filter((n: { kind: string }) => n.kind === "reminder").length;

    // The status change itself is ping 1.
    expect(await reminders()).toBe(1);
    t.ctx.scheduler.runOnce(hoursFromNow(23));
    expect(await reminders()).toBe(1);

    for (const [hours, expected] of [
      [24.01, 2],
      [48.01, 3],
      [72.01, 4],
      [96.01, 5],
    ] as const) {
      t.ctx.scheduler.runOnce(hoursFromNow(hours));
      t.ctx.scheduler.runOnce(hoursFromNow(hours)); // running twice must not double-send
      expect(await reminders()).toBe(expected);
      expect((await get()).status).toBe("waiting_on_requester");
    }

    t.ctx.scheduler.runOnce(hoursFromNow(119));
    expect((await get()).status).toBe("waiting_on_requester");
    t.ctx.scheduler.runOnce(hoursFromNow(120.01));
    expect((await get()).status).toBe("closed");
    expect(await reminders()).toBe(5);
    expect((await samNotes())[0].kind).toBe("auto_closed");
  });

  it("stops the reminders when the requester replies", async () => {
    const { sam, get, samNotes } = await ticketInStatus("waiting_on_requester");
    await t.call("POST", "/api/tickets/1/comments", { cookie: sam, body: { body: "Here you go" } });
    t.ctx.scheduler.runOnce(hoursFromNow(200));
    expect((await get()).status).toBe("in_progress");
    expect((await samNotes()).filter((n: { kind: string }) => n.kind === "reminder")).toHaveLength(1);
  });
});
