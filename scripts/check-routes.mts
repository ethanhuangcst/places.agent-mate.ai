/** Quick check: Next route handlers for discover/arrange return non-404. */
import { POST as discoverPost } from "../app/v1/discover_places/route";
import { POST as arrangePost } from "../app/v1/arrange_day/route";
import { POST as planPost } from "../app/v1/plan_itinerary/route";

async function hit(
  name: string,
  handler: (req: Request) => Promise<Response>,
  body: unknown,
) {
  const req = new Request(`http://localhost/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  const text = await res.text();
  console.log(
    name,
    res.status,
    text.slice(0, 80).replace(/\s+/g, " "),
  );
}

await hit("plan_itinerary", planPost, {});
await hit("discover_places", discoverPost, {});
await hit("arrange_day", arrangePost, {});
