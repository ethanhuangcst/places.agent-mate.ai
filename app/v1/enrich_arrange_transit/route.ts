import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("enrich_arrange_transit", request);
}
