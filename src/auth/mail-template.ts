import { t } from "../core/i18n";
import { HOSTNAME, type Locale } from "../core/locales";
import { absoluteAppUrl } from "./public-url";
import { adminMailLogoDataUri } from "./mail-logo";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

type MailKind = "reset" | "invite";

function deleteMailKeys() {
  return {
    eyebrow: "admin.mail.delete.eyebrow",
    heading: "admin.mail.delete.heading",
    intro: "admin.mail.delete.intro",
    detail: "admin.mail.delete.detail",
    ignore: "admin.mail.delete.ignore",
  };
}

export function adminDeleteMailSubject(locale: Locale): string {
  return t(locale, "admin.mail.delete.subject");
}

export function adminDeleteMailText(locale: Locale): string {
  const keys = deleteMailKeys();
  return [
    t(locale, keys.heading),
    "",
    t(locale, keys.intro),
    "",
    t(locale, keys.detail),
    "",
    t(locale, keys.ignore),
  ].join("\n");
}

export function adminDeleteMailHtml(locale: Locale): string {
  const keys = deleteMailKeys();
  const logoUrl = adminMailLogoDataUri();
  const siteUrl = absoluteAppUrl("/");
  const eyebrow = escapeHtml(t(locale, keys.eyebrow));
  const heading = escapeHtml(t(locale, keys.heading));
  const intro = escapeHtml(t(locale, keys.intro));
  const detail = escapeHtml(t(locale, keys.detail));
  const ignore = escapeHtml(t(locale, keys.ignore));
  const footer = escapeHtml(t(locale, "admin.mail.footer"));

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#fafafa;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border-collapse:collapse;font-family:'Outfit','Noto Sans SC','Noto Sans TC',Arial,sans-serif;">
      <tr>
        <td style="padding:32px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e0e0e0;border-collapse:collapse;">
            <tr>
              <td style="padding:28px 28px 0;">
                <img src="${logoUrl}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;" />
                <p style="margin:14px 0 0;font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:500;letter-spacing:0.04em;color:#0a0a0a;text-transform:lowercase;">${HOSTNAME}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 0;">
                <p style="margin:0 0 10px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#525252;">${eyebrow}</p>
                <h1 style="margin:0 0 16px;font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:600;line-height:1.25;color:#0a0a0a;">${heading}</h1>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#1f1f1f;">${intro}</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#525252;">${detail}</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e0e0e0;padding:18px 28px 24px;">
                <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#525252;">${ignore}</p>
                <p style="margin:0;font-family:'Outfit',Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b6b6b;">
                  <a href="${siteUrl}" style="color:#0a0a0a;text-decoration:underline;">${footer}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function mailKeys(kind: MailKind) {
  return kind === "reset"
    ? {
        eyebrow: "admin.mail.reset.eyebrow",
        heading: "admin.mail.reset.heading",
        intro: "admin.mail.reset.intro",
        detail: "admin.mail.reset.detail",
        cta: "admin.mail.reset.cta",
        fallback: "admin.mail.reset.fallback_label",
        ignore: "admin.mail.reset.ignore",
      }
    : {
        eyebrow: "admin.mail.invite.eyebrow",
        heading: "admin.mail.invite.heading",
        intro: "admin.mail.invite.intro",
        detail: "admin.mail.invite.detail",
        cta: "admin.mail.invite.cta",
        fallback: "admin.mail.reset.fallback_label",
        ignore: "admin.mail.invite.ignore",
      };
}

export function adminMailSubject(locale: Locale, kind: MailKind): string {
  return t(
    locale,
    kind === "reset" ? "admin.mail.reset.subject" : "admin.mail.invite.subject",
  );
}

export function adminMailText(locale: Locale, kind: MailKind, actionUrl: string): string {
  const keys = mailKeys(kind);
  return [
    t(locale, keys.heading),
    "",
    t(locale, keys.intro),
    "",
    t(locale, keys.detail),
    "",
    actionUrl,
    "",
    t(locale, keys.fallback),
    actionUrl,
    "",
    t(locale, keys.ignore),
  ].join("\n");
}

export function adminMailHtml(
  locale: Locale,
  kind: MailKind,
  actionUrl: string,
): string {
  const keys = mailKeys(kind);
  const logoUrl = adminMailLogoDataUri();
  const siteUrl = absoluteAppUrl("/");
  const eyebrow = escapeHtml(t(locale, keys.eyebrow));
  const heading = escapeHtml(t(locale, keys.heading));
  const intro = escapeHtml(t(locale, keys.intro));
  const detail = escapeHtml(t(locale, keys.detail));
  const cta = escapeHtml(t(locale, keys.cta));
  const fallback = escapeHtml(t(locale, keys.fallback));
  const ignore = escapeHtml(t(locale, keys.ignore));
  const footer = escapeHtml(t(locale, "admin.mail.footer"));
  const safeUrl = escapeHtml(actionUrl);

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#fafafa;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafafa;border-collapse:collapse;font-family:'Outfit','Noto Sans SC','Noto Sans TC',Arial,sans-serif;">
      <tr>
        <td style="padding:32px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e0e0e0;border-collapse:collapse;">
            <tr>
              <td style="padding:28px 28px 0;">
                <img src="${logoUrl}" alt="" width="48" height="48" style="display:block;width:48px;height:48px;" />
                <p style="margin:14px 0 0;font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:500;letter-spacing:0.04em;color:#0a0a0a;text-transform:lowercase;">${HOSTNAME}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 0;">
                <p style="margin:0 0 10px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#525252;">${eyebrow}</p>
                <h1 style="margin:0 0 16px;font-family:'Outfit',Arial,sans-serif;font-size:22px;font-weight:600;line-height:1.25;color:#0a0a0a;">${heading}</h1>
                <p style="margin:0 0 12px;font-size:15px;line-height:1.65;color:#1f1f1f;">${intro}</p>
                <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#525252;">${detail}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <a href="${safeUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;font-family:'Outfit',Arial,sans-serif;font-size:13px;font-weight:500;letter-spacing:0.08em;text-decoration:none;padding:12px 22px;border:1.5px solid #0a0a0a;">${cta}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 24px;">
                <p style="margin:0 0 8px;font-family:'JetBrains Mono',monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#6b6b6b;">${fallback}</p>
                <p style="margin:0;font-family:'JetBrains Mono',monospace;font-size:12px;line-height:1.55;color:#0a0a0a;word-break:break-all;">${safeUrl}</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e0e0e0;padding:18px 28px 24px;">
                <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#525252;">${ignore}</p>
                <p style="margin:0;font-family:'Outfit',Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b6b6b;">
                  <a href="${siteUrl}" style="color:#0a0a0a;text-decoration:underline;">${footer}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
