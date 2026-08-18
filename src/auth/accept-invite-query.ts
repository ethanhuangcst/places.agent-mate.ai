/** Query params that must never appear in accept-invite URLs (native GET submit leak). */
export const LEAKED_ACCEPT_INVITE_QUERY_KEYS = new Set([
  "firstName",
  "lastName",
  "username",
  "password",
  "confirm",
]);

export function acceptInviteQueryHasLeakedFields(
  params: Record<string, string | string[] | undefined>,
): boolean {
  return Object.keys(params).some((key) => LEAKED_ACCEPT_INVITE_QUERY_KEYS.has(key));
}

export function acceptInviteRedirectAfterLeak(token: string): string {
  return token ? `/accept-invite?token=${encodeURIComponent(token)}` : "/accept-invite?expired=1";
}
