import { z } from "zod";
import { normalizeProviderId } from "../core/providers";

export const localeSchema = z.enum(["EN", "CN", "HK", "TW"]);

export const providerIdSchema = z.preprocess(
  (val) => (typeof val === "string" ? normalizeProviderId(val) ?? val : val),
  z.enum(["GOOGLE_MAPS", "AMAP", "TRIPADVISOR"]),
);

const shared = {
  providers: z.array(providerIdSchema).optional(),
  locale: localeSchema.optional(),
  locales: z.array(localeSchema).optional(),
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

export const navigateBody = z.object({
  native_id: z.string().optional(),
  name: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  provider: z.string().optional(),
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
  ...shared,
});

export const arrangeDayBody = z.object({
  candidates: z.object({
    places: z.array(z.object({ name: z.string() }).passthrough()),
    restaurants: z.array(z.object({ name: z.string() }).passthrough()),
  }),
  dayIndex: z.number().int().min(1),
  date: z.string().optional(),
  origin: originSchema,
  destination: originSchema,
  pace: z.enum(["tight", "medium", "relaxed"]).optional(),
  budget: z.enum(["budget", "premium"]).optional(),
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
export type GeocodeBody = z.infer<typeof geocodeBody>;
export type NavigateBody = z.infer<typeof navigateBody>;
export type PlanItineraryBody = z.infer<typeof planItineraryBody>;
export type DiscoverPlacesBody = z.infer<typeof discoverPlacesBody>;
export type ArrangeDayBody = z.infer<typeof arrangeDayBody>;
