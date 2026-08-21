import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/client";
import { generateCallerSecret } from "../src/core/crypto";

vi.mock("@/src/auth/admin", () => ({
  requireAdmin: async () => ({ user: { id: "admin-test", email: "a@test.com" } }),
  adminError: (key: string, status = 400) =>
    Response.json({ error: { key } }, { status }),
}));

vi.mock("@/src/auth/csrf", () => ({
  csrfOk: () => true,
}));

import { GET, POST } from "../app/api/admin/api-keys/route";
import { POST as regenerate } from "../app/api/admin/api-keys/[id]/regenerate/route";

describe("caller api key secret persistence", () => {
  beforeEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });
  afterEach(async () => {
    await prisma.callerApiKey.deleteMany();
  });

  it("should_store_secret_on_create_and_return_it_in_list", async () => {
    const createRes = await POST(
      new Request("http://localhost/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": "t" },
        body: JSON.stringify({ name: "what2eat-prod", description: "e2e" }),
      }) as never,
    );
    expect(createRes.status).toBe(200);
    const created = (await createRes.json()) as { id: string; secret: string; prefix: string };
    expect(created.secret).toMatch(/^pa_/);

    const row = await prisma.callerApiKey.findUnique({ where: { id: created.id } });
    expect(row?.secret).toBe(created.secret);

    const listRes = await GET(new Request("http://localhost/api/admin/api-keys"));
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as {
      keys: { id: string; secret: string | null; prefix: string }[];
    };
    expect(list.keys).toHaveLength(1);
    expect(list.keys[0]?.secret).toBe(created.secret);
    expect(list.keys[0]?.prefix).toBe(created.prefix);
  });

  it("should_replace_stored_secret_on_regenerate", async () => {
    const first = generateCallerSecret();
    const row = await prisma.callerApiKey.create({
      data: {
        name: "rotate-me",
        keyHash: first.keyHash,
        prefix: first.prefix,
        secret: first.secret,
        status: "ACTIVE",
      },
    });

    const regenRes = await regenerate(
      new Request(`http://localhost/api/admin/api-keys/${row.id}/regenerate`, {
        method: "POST",
        headers: { "x-csrf-token": "t" },
      }) as never,
      { params: Promise.resolve({ id: row.id }) },
    );
    expect(regenRes.status).toBe(200);
    const body = (await regenRes.json()) as { secret: string };
    expect(body.secret).toMatch(/^pa_/);
    expect(body.secret).not.toBe(first.secret);

    const stored = await prisma.callerApiKey.findUnique({ where: { id: row.id } });
    expect(stored?.secret).toBe(body.secret);
  });

  it("should_list_null_secret_for_legacy_rows", async () => {
    const generated = generateCallerSecret();
    await prisma.callerApiKey.create({
      data: {
        name: "legacy",
        keyHash: generated.keyHash,
        prefix: generated.prefix,
        secret: null,
        status: "ACTIVE",
      },
    });
    const listRes = await GET(new Request("http://localhost/api/admin/api-keys"));
    const list = (await listRes.json()) as { keys: { secret: string | null }[] };
    expect(list.keys[0]?.secret).toBeNull();
  });
});
