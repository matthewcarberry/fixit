import webpush from "web-push";
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { pushSubscriptions, settings } from "../db/schema";

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

interface Logger {
  warn(obj: unknown, msg?: string): void;
}

/** Web Push using VAPID keys generated on first start and kept in the database. */
export class PushService {
  readonly publicKey: string;
  private readonly privateKey: string;

  constructor(
    private readonly db: DB,
    private readonly contact: () => string,
    private readonly log: Logger,
  ) {
    const keys = this.loadOrCreateKeys();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
  }

  private loadOrCreateKeys() {
    const read = (key: string) => this.db.select().from(settings).where(eq(settings.key, key)).get()?.value;
    const publicKey = read("vapid_public_key");
    const privateKey = read("vapid_private_key");
    if (publicKey && privateKey) return { publicKey, privateKey };
    const generated = webpush.generateVAPIDKeys();
    this.db
      .insert(settings)
      .values([
        { key: "vapid_public_key", value: generated.publicKey },
        { key: "vapid_private_key", value: generated.privateKey },
      ])
      .onConflictDoNothing()
      .run();
    return generated;
  }

  async sendToUser(userId: number, payload: PushPayload): Promise<void> {
    const subs = this.db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).all();
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload),
            {
              TTL: 60 * 60 * 24,
              vapidDetails: { subject: this.contact(), publicKey: this.publicKey, privateKey: this.privateKey },
            },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // The browser dropped this subscription; forget it.
            this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).run();
          } else {
            this.log.warn({ err, userId }, "push notification failed");
          }
        }
      }),
    );
  }
}
