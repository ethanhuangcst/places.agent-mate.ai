import { NextResponse } from "next/server";
import { authenticateCaller } from "@/src/auth/caller";
import { arrangeDay, discoverPlaces } from "@/src/core/itinerary-planner";
import { makeItinerary, createSkeletonChatCreate } from "@/src/core/make-itinerary";
import { parseLocale, type Locale } from "@/src/core/locales";
import type { PlaceCard } from "@/src/core/types";
import { dispatchTool, type ToolName } from "@/src/http/dispatch";
import { errorEnvelope } from "@/src/http/envelope";
import { arrangeDayBody, discoverPlacesBody, makeItineraryBody } from "@/src/http/schemas";

function wantsNdjson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/x-ndjson");
}

function ndjsonResponse(
  run: (write: (obj: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      };
      try {
        await run(write);
      } catch (err) {
        write({
          type: "error",
          key: "errors.provider_failed",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function postToolNdjson(
  tool: "discover_places" | "arrange_day" | "make_itinerary",
  request: Request,
  body: unknown,
) {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const locale = parseLocale(typeof raw.locale === "string" ? raw.locale : undefined);
  const extra = Array.isArray(raw.locales)
    ? (raw.locales.filter((v) => typeof v === "string") as Locale[])
    : [];

  const auth = await authenticateCaller(request.headers.get("authorization"));
  if (!auth.ok) {
    return NextResponse.json(errorEnvelope("errors.caller_unauthorized", locale, extra), {
      status: 401,
    });
  }

  if (tool === "discover_places") {
    const parsed = discoverPlacesBody.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(errorEnvelope("errors.invalid_input", locale, extra), {
        status: 400,
      });
    }
    return ndjsonResponse(async (write) => {
      await discoverPlaces(
        {
          city: parsed.data.city,
          bounds: parsed.data.bounds,
          origin: parsed.data.origin,
          locale,
          numDays: parsed.data.numDays,
        },
        { onEvent: write },
      );
    });
  }

  if (tool === "make_itinerary") {
    const parsed = makeItineraryBody.safeParse(body ?? {});
    if (!parsed.success) {
      return NextResponse.json(errorEnvelope("errors.invalid_input", locale, extra), {
        status: 400,
      });
    }
    return ndjsonResponse(async (write) => {
      await makeItinerary(
        {
          city: parsed.data.city,
          numDays: parsed.data.numDays,
          candidates: {
            places: parsed.data.candidates.places as PlaceCard[],
            restaurants: parsed.data.candidates.restaurants as PlaceCard[],
          },
          origin: parsed.data.origin,
          pace: parsed.data.pace,
          budget: parsed.data.budget,
          must_include: parsed.data.must_include,
          natural_language: parsed.data.natural_language,
          locale,
        },
        { onEvent: write, create: createSkeletonChatCreate() ?? undefined },
      );
    });
  }

  const parsed = arrangeDayBody.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(errorEnvelope("errors.invalid_input", locale, extra), {
      status: 400,
    });
  }
  return ndjsonResponse(async (write) => {
    await arrangeDay(
      {
        candidates: {
          places: parsed.data.candidates.places as PlaceCard[],
          restaurants: parsed.data.candidates.restaurants as PlaceCard[],
        },
        dayIndex: parsed.data.dayIndex,
        date: parsed.data.date ?? undefined,
        city: parsed.data.city,
        origin: parsed.data.origin,
        destination: parsed.data.destination,
        pace: parsed.data.pace,
        budget: parsed.data.budget,
        exclude_names: parsed.data.exclude_names,
        execution: parsed.data.execution,
        providers: parsed.data.providers,
        preferences: parsed.data.preferences,
        locale,
      },
      { onEvent: write },
    );
  });
}

export async function postTool(tool: ToolName, request: Request) {
  const body = await request.json().catch(() => ({}));
  if (
    wantsNdjson(request) &&
    (tool === "discover_places" || tool === "arrange_day" || tool === "make_itinerary")
  ) {
    return postToolNdjson(tool, request, body);
  }
  const result = await dispatchTool(tool, request.headers.get("authorization"), body);
  return NextResponse.json(result.envelope, { status: result.status });
}
