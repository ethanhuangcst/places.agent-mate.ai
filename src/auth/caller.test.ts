import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const update = vi.fn();

vi.mock("../db/client", () => ({
  prisma: {
    callerApiKey: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import { authenticateCaller } from "./caller";

describe("authenticateCaller", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it("should_return_ok_false_when_caller_table_is_missing", async () => {
    findUnique.mockRejectedValue(
      Object.assign(new Error("The table `public.CallerApiKey` does not exist"), {
        code: "P2021",
      }),
    );

    const result = await authenticateCaller("Bearer test-secret");

    expect(result).toEqual({ ok: false });
  });

  it("should_return_ok_false_when_authorization_header_is_missing", async () => {
    const result = await authenticateCaller(null);
    expect(result).toEqual({ ok: false });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
