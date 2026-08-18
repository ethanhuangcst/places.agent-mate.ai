const USERNAME_RE = /^[a-z0-9][a-z0-9_-]{2,31}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value);
  return USERNAME_RE.test(normalized) && !normalized.startsWith("pending-");
}

export function pendingUsername(): string {
  return `pending-${crypto.randomUUID()}`;
}

export function adminDisplayName(input: {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
  passwordHash?: string;
}): string | null {
  if (!input.passwordHash) return null;
  const full = [input.firstName, input.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return full || input.username;
}
