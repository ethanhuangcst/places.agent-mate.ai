import { postTool } from "@/src/http/route";

export async function POST(request: Request) {
  return postTool("fetch_trip_details", request);
}
