import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("patch_trip", request);
}
