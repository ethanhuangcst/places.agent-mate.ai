import { HOSTNAME } from "../core/locales";

function publicBaseUrl(): string {
  const configured =
    process.env.PUBLIC_BASE_URL?.trim() || process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return `https://${HOSTNAME}`;
  const port = process.env.PORT?.trim() || "3000";
  return `http://localhost:${port}`;
}

export function absoluteAppUrl(path: string): string {
  const prefix = path.startsWith("/") ? path : `/${path}`;
  return `${publicBaseUrl()}${prefix}`;
}

export function setPasswordUrl(token: string): string {
  return absoluteAppUrl(`/set-password?token=${encodeURIComponent(token)}`);
}

export function acceptInviteUrl(token: string): string {
  return absoluteAppUrl(`/accept-invite?token=${encodeURIComponent(token)}`);
}
