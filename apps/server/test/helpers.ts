import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildApp } from "../src/app";
import { loadConfig, type Config } from "../src/config";

export async function makeApp(overrides: Partial<Config> = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fixit-test-"));
  const config = loadConfig({ dataDir, webDir: path.join(dataDir, "no-web"), ...overrides });
  const { app, ctx } = await buildApp(config, { logger: false, dbFile: ":memory:" });

  const cookieFrom = (res: { headers: Record<string, unknown> }) => {
    const raw = res.headers["set-cookie"];
    const header = Array.isArray(raw) ? raw[0] : String(raw);
    return header.split(";")[0]!;
  };

  const call = async (
    method: "GET" | "POST" | "PATCH",
    url: string,
    opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) => {
    const res = await app.inject({
      method,
      url,
      payload: opts.body as never,
      headers: { ...(opts.cookie ? { cookie: opts.cookie } : {}), ...opts.headers },
    });
    return { status: res.statusCode, body: res.body ? safeJson(res.body) : null, res };
  };

  const setupAdmin = async () => {
    const r = await call("POST", "/api/setup", {
      body: { name: "Matt", email: "matt@example.com", password: "correct horse battery" },
    });
    return cookieFrom(r.res);
  };

  const addRequester = async (adminCookie: string, name: string, email: string) => {
    await call("POST", "/api/users", {
      cookie: adminCookie,
      body: { name, email, password: "requester password 1" },
    });
    const r = await call("POST", "/api/auth/login", { body: { email, password: "requester password 1" } });
    return cookieFrom(r.res);
  };

  const cleanup = async () => {
    await ctx.notifier.flush();
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  };

  return { app, ctx, call, setupAdmin, addRequester, cleanup, dataDir };
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);
