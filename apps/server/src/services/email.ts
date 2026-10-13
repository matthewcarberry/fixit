import nodemailer, { type Transporter } from "nodemailer";
import { emailEnabled, type Config } from "../config";

interface Logger {
  warn(obj: unknown, msg?: string): void;
}

/** Optional email delivery. Does nothing unless SMTP_HOST and SMTP_FROM are set. */
export class EmailService {
  private transport: Transporter | null = null;

  constructor(
    private readonly config: Config,
    private readonly log: Logger,
  ) {
    if (emailEnabled(config)) {
      this.transport = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      });
    }
  }

  get enabled() {
    return this.transport !== null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transport) return;
    try {
      await this.transport.sendMail({ from: this.config.smtp.from, to, subject, text });
    } catch (err) {
      this.log.warn({ err, to }, "email failed");
    }
  }
}
