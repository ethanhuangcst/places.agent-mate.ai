import { NextResponse } from "next/server";
import { runChatLoop } from "@/src/agent/loop";
import { authenticateCaller } from "@/src/auth/caller";
import { errorEnvelope, okEnvelope } from "@/src/http/envelope";
import { parseLocale } from "@/src/core/locales";
import { chatBody } from "@/src/http/schemas";

export async function POST(request: Request) {
  const raw = await request.json().catch(() => ({}));
  const locale = parseLocale(
    typeof raw === "object" && raw && "locale" in raw
      ? String((raw as { locale?: string }).locale)
      : undefined,
  );

  const auth = await authenticateCaller(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(errorEnvelope("errors.caller_unauthorized", locale), {
      status: 401,
    });
  }

  const parsed = chatBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(errorEnvelope("errors.invalid_input", locale), { status: 400 });
  }

  const result = await runChatLoop(parsed.data);
  const envelope = okEnvelope(
    {
      message: result.message,
      tool_calls: result.tool_calls,
    },
    result.locale,
  );
  if (result.outcomeKey) {
    return NextResponse.json(
      {
        ...envelope,
        ok: false,
        outcome: { key: result.outcomeKey, locales: { [result.locale]: result.message.content } },
      },
      { status: result.outcomeKey.startsWith("errors.upload") ? 400 : 502 },
    );
  }
  return NextResponse.json(envelope);
}
