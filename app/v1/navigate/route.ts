import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("navigate", request);
}
