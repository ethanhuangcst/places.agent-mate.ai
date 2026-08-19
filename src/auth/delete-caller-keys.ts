import { prisma } from "../db/client";

const MAX_IDS = 100;

export type ParseBulkDeleteIds =
  | { ok: true; ids: string[] }
  | { error: string; status: number };

export function parseBulkDeleteIds(body: unknown): ParseBulkDeleteIds {
  if (!body || typeof body !== "object" || !("ids" in body)) {
    return { error: "errors.invalid_input", status: 400 };
  }
  const raw = (body as { ids: unknown }).ids;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IDS) {
    return { error: "errors.invalid_input", status: 400 };
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || !value.trim()) {
      return { error: "errors.invalid_input", status: 400 };
    }
    const id = value.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return { ok: true, ids };
}

export async function deleteCallerKeys(ids: string[]): Promise<number> {
  const result = await prisma.callerApiKey.deleteMany({
    where: { id: { in: ids } },
  });
  return result.count;
}
