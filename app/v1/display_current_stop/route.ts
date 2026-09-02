import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("display_current_stop", request);
}
