import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("search_restaurants", request);
}
