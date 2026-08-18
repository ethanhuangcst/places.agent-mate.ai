import { z } from "zod";

export const localeSchema = z.enum(["EN", "CN", "HK", "TW"]);

const shared = {
  providers: z.array(z.string()).optional(),
  locale: localeSchema.optional(),
  locales: z.array(localeSchema).optional(),
};

export const searchRestaurantsBody = z.object({
  query: z.string().optional(),
  near: z.object({ lat: z.number(), lng: z.number() }).optional(),
  address: z.string().optional(),
  open_now: z.boolean().optional(),
  cuisine: z.string().optional(),
  merge: z.boolean().optional(),
  ...shared,
});

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

export type SearchRestaurantsBody = z.infer<typeof searchRestaurantsBody>;
export type GetPlaceDetailsBody = z.infer<typeof getPlaceDetailsBody>;
export type GeocodeBody = z.infer<typeof geocodeBody>;
export type NavigateBody = z.infer<typeof navigateBody>;
