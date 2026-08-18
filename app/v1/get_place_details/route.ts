import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("get_place_details", request);
}
