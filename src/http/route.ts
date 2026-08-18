import { NextResponse } from "next/server";
import { dispatchTool, type ToolName } from "@/src/http/dispatch";

export async function postTool(tool: ToolName, request: Request) {
  const body = await request.json().catch(() => ({}));
  const result = await dispatchTool(tool, request.headers.get("authorization"), body);
  return NextResponse.json(result.envelope, { status: result.status });
}
