/**
 * Transactional email templates (US-010). Plain text first: these carry a
 * link and a sentence or two, and plain text survives every client and spam
 * filter. Pure functions so they are unit-testable and never touch the DB.
 */

export const TEMPLATES = ["verify_email", "reset_password", "approval_needed"] as const;
export type EmailTemplate = (typeof TEMPLATES)[number];

export type TemplateData = {
  verify_email: { name: string; link: string };
  reset_password: { name: string; link: string };
  approval_needed: { name: string; what: string; link: string };
};

export type Rendered = { subject: string; text: string };

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
const SIGNOFF = "\n\n— Banyan\n";

export function renderEmail<T extends EmailTemplate>(template: T, data: TemplateData[T]): Rendered {
  switch (template) {
    case "verify_email": {
      const d = data as TemplateData["verify_email"];
      return {
        subject: "Confirm your email for Banyan",
        text:
          `Hi ${firstName(d.name)},\n\n` +
          `Confirm this is your email address so Banyan can publish in your name:\n\n${d.link}\n\n` +
          "The link works once and expires in 24 hours. If you did not create a Banyan account, ignore this email." +
          SIGNOFF,
      };
    }
    case "reset_password": {
      const d = data as TemplateData["reset_password"];
      return {
        subject: "Reset your Banyan password",
        text:
          `Hi ${firstName(d.name)},\n\n` +
          `Someone asked to reset the password for this Banyan account. To choose a new one, open:\n\n${d.link}\n\n` +
          "The link works once and expires in 1 hour. Setting a new password signs out every other session.\n" +
          "If you did not ask for this, ignore this email; your password stays as it is." +
          SIGNOFF,
      };
    }
    case "approval_needed": {
      const d = data as TemplateData["approval_needed"];
      return {
        subject: `Waiting on you: ${d.what}`.slice(0, 120),
        text:
          `Hi ${firstName(d.name)},\n\n` +
          `${d.what} is ready and waiting for your decision. Nothing is published until you approve it.\n\n${d.link}` +
          SIGNOFF,
      };
    }
    default:
      throw new Error(`Unknown email template "${String(template)}"`);
  }
}
