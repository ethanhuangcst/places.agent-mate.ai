import { NextResponse } from "next/server";
import { healthEnvelope } from "@/src/http/envelope";

export async function GET() {
  return NextResponse.json(healthEnvelope());
}
