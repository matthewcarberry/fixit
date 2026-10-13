import path from "node:path";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative whole number, got "${raw}"`);
  }
  return value;
}

function str(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export interface Config {
  port: number;
  host: string;
  /** Folder for the database, uploaded photos and generated keys. */
  dataDir: string;
  /** Public address people use, e.g. https://fixit.example.com. Used in links and push setup. */
  publicUrl: string;
  ticketPrefix: string;
  maxUploadMb: number;
  /** Hours a Resolved ticket waits before closing on its own. */
  resolvedAutoCloseHours: number;
  /** Hours between reminders while a ticket is Waiting on requester. */
  waitingReminderHours: number;
  /** Reminders sent (including the first, when the status is set) before the ticket closes. */
  waitingMaxReminders: number;
  schedulerIntervalSeconds: number;
  sessionDays: number;
  /** Serve cookies with the Secure flag. "auto" trusts the proxy's X-Forwarded-Proto. */
  secureCookies: "auto" | "true" | "false";
  trustProxy: boolean;
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
    secure: boolean;
  };
  webDir: string;
  version: string;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const dataDir = path.resolve(str("FIXIT_DATA_DIR", "/config"));
  const smtpPort = int("SMTP_PORT", 587);
  const secureCookies = str("FIXIT_SECURE_COOKIES", "auto");
  const config: Config = {
    port: int("PORT", 8080),
    host: str("HOST", "0.0.0.0"),
    dataDir,
    publicUrl: str("FIXIT_PUBLIC_URL").replace(/\/+$/, ""),
    ticketPrefix: str("FIXIT_TICKET_PREFIX", "HOME").toUpperCase(),
    maxUploadMb: int("FIXIT_MAX_UPLOAD_MB", 15),
    resolvedAutoCloseHours: int("FIXIT_RESOLVED_AUTOCLOSE_HOURS", 48),
    waitingReminderHours: int("FIXIT_WAITING_REMINDER_HOURS", 24),
    waitingMaxReminders: int("FIXIT_WAITING_MAX_REMINDERS", 5),
    schedulerIntervalSeconds: int("FIXIT_SCHEDULER_INTERVAL_SECONDS", 300),
    sessionDays: int("FIXIT_SESSION_DAYS", 90),
    secureCookies: (["auto", "true", "false"].includes(secureCookies) ? secureCookies : "auto") as Config["secureCookies"],
    trustProxy: str("FIXIT_TRUST_PROXY", "true") !== "false",
    smtp: {
      host: str("SMTP_HOST"),
      port: smtpPort,
      user: str("SMTP_USER"),
      pass: str("SMTP_PASS"),
      from: str("SMTP_FROM"),
      secure: str("SMTP_SECURE", smtpPort === 465 ? "true" : "false") === "true",
    },
    webDir: path.resolve(str("FIXIT_WEB_DIR", path.join(process.cwd(), "public"))),
    version: str("FIXIT_VERSION", "dev"),
    ...overrides,
  };
  return config;
}

export function emailEnabled(config: Config): boolean {
  return Boolean(config.smtp.host && config.smtp.from);
}
