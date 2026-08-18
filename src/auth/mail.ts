import { type Locale } from "../core/locales";
import { acceptInviteUrl, setPasswordUrl } from "./public-url";
import {
  adminDeleteMailHtml,
  adminDeleteMailSubject,
  adminDeleteMailText,
  adminMailHtml,
  adminMailSubject,
  adminMailText,
} from "./mail-template";

const outbox: { to: string; subject: string; text: string; html: string }[] = [];

export function getMailOutbox() {
  return outbox;
}

export function resetMailContent(locale: Locale, token: string) {
  const url = setPasswordUrl(token);
  return {
    subject: adminMailSubject(locale, "reset"),
    text: adminMailText(locale, "reset", url),
    html: adminMailHtml(locale, "reset", url),
  };
}

export function inviteMailContent(locale: Locale, token: string) {
  const url = acceptInviteUrl(token);
  return {
    subject: adminMailSubject(locale, "invite"),
    text: adminMailText(locale, "invite", url),
    html: adminMailHtml(locale, "invite", url),
  };
}

export function deleteMailContent(locale: Locale) {
  return {
    subject: adminDeleteMailSubject(locale),
    text: adminDeleteMailText(locale),
    html: adminDeleteMailHtml(locale),
  };
}

/** @deprecated use resetMailContent */
export function resetMailText(locale: Locale, token: string): string {
  return resetMailContent(locale, token).text;
}

/** @deprecated use inviteMailContent */
export function inviteMailText(locale: Locale, token: string): string {
  return inviteMailContent(locale, token).text;
}

export async function sendAdminMail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  if (process.env.RESEND_API_KEY) {
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@places.agent-mate.ai";
    const from = `places-agent <${fromEmail}>`;
    const res = await fetch(`${process.env.RESEND_BASE_URL ?? "https://api.resend.com"}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "places-agent/0.1",
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("resend_send_failed", res.status, detail.slice(0, 300));
      if (process.env.NODE_ENV !== "production") {
        console.warn("resend_dev_outbox_fallback", input.to);
        outbox.push(input);
        return true;
      }
    }
    return res.ok;
  }
  outbox.push(input);
  return true;
}
