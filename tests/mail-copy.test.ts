import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteMailContent,
  inviteMailContent,
  resetMailContent,
  inviteMailText,
  resetMailText,
} from "../src/auth/mail";
import { adminDeleteMailHtml, adminMailHtml } from "../src/auth/mail-template";

describe("admin mail copy", () => {
  const previous = process.env.PUBLIC_BASE_URL;

  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = "https://places.agent-mate.ai";
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = previous;
  });

  it("should_include_absolute_set_password_url_when_reset_mail_is_built", () => {
    const text = resetMailText("EN", "tok-reset-1");
    expect(text).toContain(
      "https://places.agent-mate.ai/set-password?token=tok-reset-1",
    );
    expect(text).not.toMatch(/(^|\n)\/set-password/);
  });

  it("should_include_absolute_accept_invite_url_when_invite_mail_is_built", () => {
    const text = inviteMailText("EN", "tok-invite-1");
    expect(text).toContain(
      "https://places.agent-mate.ai/accept-invite?token=tok-invite-1",
    );
    expect(text).not.toMatch(/(^|\n)\/accept-invite/);
  });

  it("should_resolve_reset_mail_body_from_i18n_keys", () => {
    const en = resetMailText("EN", "tok");
    const hk = resetMailText("HK", "tok");
    const tw = resetMailText("TW", "tok");
    expect(en).toContain("Reset your admin password");
    expect(hk).not.toBe(tw);
    expect(hk).toContain("https://places.agent-mate.ai/set-password?token=tok");
  });

  it("should_use_mail_subject_keys", () => {
    const reset = resetMailContent("EN", "tok");
    const invite = inviteMailContent("EN", "tok");
    expect(reset.subject).toContain("Reset your admin password");
    expect(invite.subject).toContain("invited");
  });

  it("should_render_html_reset_mail_with_cta_and_footer", () => {
    const url = "https://places.agent-mate.ai/set-password?token=tok";
    const html = adminMailHtml("EN", "reset", url);
    expect(html).toContain('href="' + url + '"');
    expect(html).toContain("Set new password");
    expect(html).toContain("places.agent-mate.ai");
    expect(html).toContain("data:image/png;base64,");
  });

  it("should_build_delete_notification_mail_without_action_token_url", () => {
    const mail = deleteMailContent("EN");
    expect(mail.subject).toContain("Your admin account was removed: places.agent-mate.ai");
    expect(mail.text).toContain("admin web app");
    expect(mail.text).toContain("removed");
    expect(mail.text).not.toContain("token=");
    const html = adminDeleteMailHtml("EN");
    expect(html).toContain("removed");
    expect(html).not.toContain("set-password");
    expect(html).not.toContain("accept-invite");
  });
});
