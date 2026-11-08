import { env, isProd } from "@/lib/env";
import { log } from "@/lib/log";
import type { Rendered } from "./templates";

/**
 * Where email goes (US-010). SMTP works with any vendor, so choosing Resend,
 * Postmark or Brevo is a configuration change, not a code change. Without
 * SMTP_URL the dev transport prints the email to the server log, labelled
 * "not sent (dev transport)", so recovery and verification links are usable
 * locally and nobody mistakes them for delivered mail.
 */

export type OutgoingEmail = Rendered & { to: string };
export type SendResult = { transport: "smtp" | "dev"; delivered: boolean; providerId: string | null };

export interface EmailTransport {
  readonly name: "smtp" | "dev";
  send(mail: OutgoingEmail): Promise<SendResult>;
}

/** A send failure the outbox should retry (connection trouble, 4xx/5xx from the server). */
export class EmailSendError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "EmailSendError";
  }
}

export function emailConfigured(): boolean {
  return env.SMTP_URL.trim().length > 0;
}

/** Strip anything that could smuggle extra headers or recipients into a single address. */
export function safeAddress(raw: string): string | null {
  const a = raw.trim();
  if (a.length > 254 || /[\r\n,;<>"()\\]/.test(a)) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a) ? a : null;
}

class DevTransport implements EmailTransport {
  readonly name = "dev" as const;
  async send(mail: OutgoingEmail): Promise<SendResult> {
    log("info", "email.not_sent_dev_transport", { to: mail.to, subject: mail.subject });
    if (!isProd) {
      // Development only: the full text (with its link) so the flow can be completed locally.
      console.info(`\n----- EMAIL NOT SENT (dev transport) -----\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n------------------------------------------\n`);
    }
    return { transport: "dev", delivered: false, providerId: null };
  }
}

class SmtpTransport implements EmailTransport {
  readonly name = "smtp" as const;
  private transporter: Promise<import("nodemailer").Transporter> | null = null;

  private get() {
    if (!this.transporter) {
      this.transporter = import("nodemailer").then((m) =>
        m.createTransport(env.SMTP_URL, {
          // Never fetch files or URLs while building a message.
          disableFileAccess: true,
          disableUrlAccess: true,
        } as never),
      );
    }
    return this.transporter;
  }

  async send(mail: OutgoingEmail): Promise<SendResult> {
    const t = await this.get();
    try {
      const info = await t.sendMail({
        from: env.EMAIL_FROM,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        // Optional mail: one-click unsubscribe (RFC 2369 + RFC 8058), which mailbox providers expect from bulk senders.
        ...(mail.listUnsubscribe
          ? { list: { unsubscribe: { url: mail.listUnsubscribe, comment: "Unsubscribe" } }, headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
      });
      if (info.rejected?.length) throw new EmailSendError("The mail server rejected the recipient.", false);
      return { transport: "smtp", delivered: true, providerId: typeof info.messageId === "string" ? info.messageId : null };
    } catch (err) {
      if (err instanceof EmailSendError) throw err;
      const e = err as { responseCode?: number; code?: string; message?: string };
      // 5xx other than 550-553 (mailbox problems) and every network error are worth retrying.
      const permanent = typeof e.responseCode === "number" && e.responseCode >= 550 && e.responseCode <= 553;
      throw new EmailSendError(`SMTP ${e.responseCode ?? e.code ?? "error"}: ${(e.message ?? "send failed").slice(0, 200)}`, !permanent);
    }
  }
}

let override: EmailTransport | null = null;
const devTransport = new DevTransport();
let smtpTransport: SmtpTransport | null = null;

export function getTransport(): EmailTransport {
  if (override) return override;
  if (!emailConfigured()) return devTransport;
  smtpTransport ??= new SmtpTransport();
  return smtpTransport;
}

/** Tests only: route sends through a fake transport. */
export function setTransportForTests(t: EmailTransport | null): void {
  override = t;
}
