import { NextResponse } from "next/server";

/**
 * Handle known Prisma errors and return appropriate HTTP responses.
 * Returns null if the error is not a known Prisma error.
 *
 * Self-contained — does not import from src/auth/admin.ts (which has "server-only").
 */
export function handlePrismaError(err: unknown): NextResponse | null {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    "name" in err &&
    (err as { name: string }).name === "PrismaClientKnownRequestError"
  ) {
    const code = (err as { code: string }).code;
    if (code === "P2025") {
      return NextResponse.json({ error: { key: "errors.not_found" } }, { status: 404 });
    }
    if (code === "P2002") {
      return NextResponse.json({ error: { key: "errors.duplicate" } }, { status: 409 });
    }
  }
  return null;
}

/**
 * Wrap an async route handler to catch Prisma errors automatically.
 * Non-Prisma errors are re-thrown for the framework to handle.
 */
export async function withPrismaErrorHandler(
  fn: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    const handled = handlePrismaError(err);
    if (handled) return handled;
    throw err;
  }
}
