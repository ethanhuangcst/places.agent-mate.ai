import { describe, it, expect } from "vitest";
import { handlePrismaError, withPrismaErrorHandler } from "./api-error-handler";

function makePrismaError(code: string) {
  const err = new Error(`Prisma error ${code}`) as Error & { code: string; name: string };
  err.name = "PrismaClientKnownRequestError";
  err.code = code;
  return err;
}

describe("handlePrismaError", () => {
  it("P2025 (record not found) → 404", async () => {
    const res = handlePrismaError(makePrismaError("P2025"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(404);
    const body = await res!.json();
    expect(body.error.key).toBe("errors.not_found");
  });

  it("P2002 (unique constraint) → 409", async () => {
    const res = handlePrismaError(makePrismaError("P2002"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);
    const body = await res!.json();
    expect(body.error.key).toBe("errors.duplicate");
  });

  it("non-Prisma error → null", () => {
    expect(handlePrismaError(new Error("random"))).toBeNull();
    expect(handlePrismaError(null)).toBeNull();
    expect(handlePrismaError("string error")).toBeNull();
  });
});

describe("withPrismaErrorHandler", () => {
  it("should return handler result on success", async () => {
    const { NextResponse } = await import("next/server");
    const res = await withPrismaErrorHandler(async () =>
      NextResponse.json({ ok: true }),
    );
    expect(res.status).toBe(200);
  });

  it("should catch P2025 and return 404", async () => {
    const res = await withPrismaErrorHandler(async () => {
      throw makePrismaError("P2025");
    });
    expect(res.status).toBe(404);
  });

  it("should re-throw non-Prisma errors", async () => {
    await expect(
      withPrismaErrorHandler(async () => {
        throw new Error("network failure");
      }),
    ).rejects.toThrow("network failure");
  });
});
