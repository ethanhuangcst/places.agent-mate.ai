import { coerceAgentTime } from "../core/coerce-agent-time";
import { z } from "zod";
import { normalizeProviderId } from "../core/providers";
import { ItinerarySkeletonSchema } from "../core/make-itinerary";

export const localeSchema = z.enum(["EN", "CN", "HK", "TW"]);

export const providerIdSchema = z.preprocess(
  (val) => (typeof val === "string" ? normalizeProviderId(val) ?? val : val),
  z.enum(["GOOGLE_MAPS", "AMAP", "TRIPADVISOR"]),
);

const hhmm = z.preprocess(
  (val) => (typeof val === "string" ? coerceAgentTime(val, "09:00") : val),
  z.string().regex(/^\d{2}:\d{2}$/),
);

const shared = {
  providers: z.array(providerIdSchema).optional(),
  locale: localeSchema.optional(),
  locales: z.array(localeSchema).optional(),
  /** ADR-046 — optional trip ledger id (lazy-created when omitted on write tools). */
  trip_id: z.string().min(1).optional(),
  revision: z.number().int().positive().optional(),
};

export const searchRestaurantsBody = z.object({
  query: z.string().optional(),
  near: z
    .object({
      lat: z.number(),
      lng: z.number(),
      crs: z.enum(["WGS84", "GCJ-02"]).optional(),
    })
    .optional(),
  address: z.string().optional(),
  open_now: z.boolean().optional(),
  cuisine: z.string().optional(),
  merge: z.boolean().optional(),
  enrich: z.object({ tripadvisor: z.boolean().optional() }).optional(),
  ...shared,
});

export const searchPlacesBody = searchRestaurantsBody;

export const getPlaceDetailsBody = z.object({
  provider: z.string().min(1),
  native_id: z.string().min(1),
  ...shared,
});

export const geocodeBody = z.object({
  query: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    ...shared,
});

const placeCardSchema = z.object({
  provider: z.string(),
  name: z.string(),
  address: z.string().optional(),
  location: z.object({
    lat: z.number(),
    lng: z.number(),
    crs: z.enum(["WGS84", "GCJ-02"]),
  }),
  category: z.string().optional(),
  rating: z.number().optional(),
  sources: z.array(
    z.object({
      provider: z.string(),
      native_id: z.string(),
      deeplinks: z.record(z.string(), z.string()),
    }),
  ),
});

export const planItineraryBody = z.object({
  detail: z.enum(["stops", "timed"]).optional(),
  origin: z
    .object({
      name: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
  destination: z
    .object({
      name: z.string().optional(),
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .optional(),
  timezone: z.string().optional(),
  bounds: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .optional(),
  places: z.array(placeCardSchema).optional(),
  preferences: z
    .object({
      pace: z.enum(["tight", "medium", "relaxed"]).optional(),
      spend: z.enum(["budget", "premium"]).optional(),
      transit_preferred: z.boolean().optional(),
      natural_language: z.string().optional(),
    })
    .optional(),
  party_size: z.number().int().min(1).max(20).optional(),
  ...shared,
});

const originSchema = z
  .object({
    name: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  })
  .optional();

export const discoverPlacesBody = z.object({
  city: z.string().min(1),
  bounds: z.object({
    start: z.string(),
    end: z.string(),
  }),
  origin: originSchema,
  numDays: z.number().int().min(1).max(14).optional(),
  must_include: z.array(z.string()).optional(),
  max_number: z.number().int().min(1).max(12).optional(),
  party_size: z.number().int().min(1).max(20).optional(),
  budget: z.string().optional(),
  ...shared,
});

export const arrangeDayBody = z.object({
  candidates: z
    .object({
      places: z.array(z.object({ name: z.string() }).passthrough()),
      restaurants: z.array(z.object({ name: z.string() }).passthrough()),
    })
    .optional()
    .default({ places: [], restaurants: [] }),
  dayIndex: z.number().int().min(1),
  date: z.string().nullish(),
  city: z.string().min(1).optional(),
  origin: originSchema,
  destination: originSchema,
  pace: z.enum(["tight", "medium", "relaxed"]).optional(),
  budget: z.enum(["budget", "premium"]).optional(),
  exclude_names: z.array(z.string()).optional(),
  preferences: z
    .object({
      time_from: z.string().optional(),
      time_to: z.string().optional(),
      transit_preferred: z.boolean().optional(),
      natural_language: z.string().optional(),
      day_theme: z.string().optional(),
      must_include: z.array(z.string()).optional(),
      spend_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      interests: z.string().optional(),
    })
    .passthrough()
    .optional(),
  /** Mode H: host returns prompts without server LLM. HTTP default remains agent when omitted. */
  execution: z.enum(["agent", "host"]).optional(),
  party_size: z.number().int().min(1).max(20).optional(),
  num_days: z.number().int().min(1).max(14).optional(),
  spend_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  ...shared,
});

const arrangeBlockSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  start_time: z.string(),
  duration_min: z.number().int().positive(),
  reason: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

export const enrichArrangeTransitBody = z.object({
  day: z.object({
    day_index: z.number().int().positive().optional(),
    date: z.string().optional(),
    theme: z.string().optional(),
    from_origin: z
      .object({
        transport: z.string().optional(),
        duration_min: z.number().optional(),
      })
      .optional(),
    to_destination: z
      .object({
        transport: z.string().optional(),
        duration_min: z.number().optional(),
      })
      .optional(),
    blocks: z.array(arrangeBlockSchema).min(1),
  }),
  candidates: z.object({
    places: z.array(z.object({ name: z.string() }).passthrough()),
    restaurants: z.array(z.object({ name: z.string() }).passthrough()),
  }),
  origin: originSchema,
  destination: originSchema,
  preferences: z
    .object({
      transit_preferred: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
  ...shared,
});

export const chatBody = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant", "system"]),
      content: z.string(),
    }),
  ),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        mime_type: z.string(),
        content_base64: z.string(),
      }),
    )
    .optional(),
  ...shared,
});

export type ChatBody = z.infer<typeof chatBody>;
export type SearchRestaurantsBody = z.infer<typeof searchRestaurantsBody>;
export type SearchPlacesBody = z.infer<typeof searchPlacesBody>;
export type GetPlaceDetailsBody = z.infer<typeof getPlaceDetailsBody>;
export const makeItineraryBody = z.object({
  city: z.string().min(1),
  numDays: z.number().int().min(1).max(14),
  candidates: z
    .object({
      places: z.array(z.object({ name: z.string() }).passthrough()).optional().default([]),
      restaurants: z.array(z.object({ name: z.string() }).passthrough()).optional().default([]),
    })
    .optional()
    .default({ places: [], restaurants: [] }),
  origin: originSchema,
  pace: z.enum(["tight", "medium", "relaxed"]).optional(),
  budget: z.enum(["budget", "premium"]).optional(),
  must_include: z.array(z.string()).optional(),
  natural_language: z.string().optional(),
  ...shared,
});

const planNextStopPointSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["stay", "attraction", "meal"]).optional(),
  meal_slot: z.enum(["lunch", "afternoon_tea", "dinner"]).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  end_time: hhmm.optional(),
});

export const planNextStopBody = z
  .object({
    origin_mode: z.boolean().optional(),
    with_stop_display: z.boolean().optional(),
    current_stop: planNextStopPointSchema.optional(),
    next_stop: planNextStopPointSchema,
    candidates: z
      .object({
        places: z.array(z.object({ name: z.string() }).passthrough()),
        restaurants: z.array(z.object({ name: z.string() }).passthrough()),
      })
      .optional()
      .default({ places: [], restaurants: [] }),
    transit_preference: z.string().optional(),
    city: z.string().optional(),
    previous_stop: z
      .object({
        name: z.string().optional(),
        end_time: hhmm.optional(),
        kind: z.enum(["stay", "attraction", "meal"]).optional(),
      })
      .optional(),
    legs_to_here: z.array(z.any()).optional(),
    time_from: hhmm.optional(),
    stay_role: z.enum(["day_origin", "return", "midday"]).optional(),
    default_duration_min: z.number().int().min(10).max(480).optional(),
    ...shared,
  })
  .superRefine((data, ctx) => {
    if (!data.origin_mode && !data.current_stop) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "current_stop required unless origin_mode",
        path: ["current_stop"],
      });
    }
  });

/** @deprecated F65 — merged into plan_next_stop; kept for schema tests only. */
export const displayCurrentStopBody = z.object({
  stop: planNextStopPointSchema,
  candidates: z
    .object({
      places: z.array(z.object({ name: z.string() }).passthrough()),
      restaurants: z.array(z.object({ name: z.string() }).passthrough()),
    })
    .optional()
    .default({ places: [], restaurants: [] }),
  previous_stop: z
    .object({
      name: z.string().optional(),
      end_time: hhmm.optional(),
      kind: z.enum(["stay", "attraction", "meal"]).optional(),
    })
    .optional(),
  legs_to_here: z.array(z.any()).optional(),
  default_duration_min: z.number().int().min(10).max(480).optional(),
  time_from: hhmm.optional(),
  stay_role: z.enum(["day_origin", "return", "midday"]).optional(),
  ...shared,
});

export type GeocodeBody = z.infer<typeof geocodeBody>;
export type PlanItineraryBody = z.infer<typeof planItineraryBody>;
export type DiscoverPlacesBody = z.infer<typeof discoverPlacesBody>;
export type ArrangeDayBody = z.infer<typeof arrangeDayBody>;
export type EnrichArrangeTransitBody = z.infer<typeof enrichArrangeTransitBody>;
export type MakeItineraryBody = z.infer<typeof makeItineraryBody>;
export type PlanNextStopBody = z.infer<typeof planNextStopBody>;
export type DisplayCurrentStopBody = z.infer<typeof displayCurrentStopBody>;

export const visaRequirementBody = z.object({
  passport: z.string().min(1),
  destination: z.string().min(1),
  ...shared,
});

export const travelTipsBody = z.object({
  destination: z.string().min(1),
  bounds: z.object({ start: z.string(), end: z.string() }).optional(),
  trip_type: z.string().optional(),
  pace: z.enum(["tight", "medium", "relaxed"]).optional(),
  skeleton: ItinerarySkeletonSchema.optional(),
  constraints: z.string().optional(),
  pool: z.array(z.string()).optional(),
  ...shared,
});

export type VisaRequirementBody = z.infer<typeof visaRequirementBody>;
export type TravelTipsBody = z.infer<typeof travelTipsBody>;

export const fetchTripDetailsBody = z.object({
  ...shared,
  trip_id: z.string().min(1),
  fields: z.array(z.string().min(1)).min(1).default(["skeleton"]),
  day_index: z.number().int().positive().optional(),
});

export type FetchTripDetailsBody = z.infer<typeof fetchTripDetailsBody>;

export const patchTripBody = z.object({
  ...shared,
  trip_id: z.string().min(1),
  constraints: z.record(z.string(), z.unknown()),
});

export type PatchTripBody = z.infer<typeof patchTripBody>;
