import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("plan_next_stop", request);
}
