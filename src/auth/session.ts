import "server-only";
import { cookies } from "next/headers";
import {
  COOKIE,
  LOCALE_COOKIE,
  decodeSession,
  encodeSession,
  type SessionPayload,
} from "./session-token";

export type { SessionPayload };
export { COOKIE, LOCALE_COOKIE, decodeSession };

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export async function writeSession(payload: SessionPayload): Promise<void> {
  const jar = await cookies();
  const secure = process.env.NODE_ENV === "production";
  jar.set(COOKIE, encodeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readLocaleCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(LOCALE_COOKIE)?.value;
}

export async function writeLocaleCookie(locale: string): Promise<void> {
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
