import { type ProviderId } from "./providers";
import { type Locale } from "./locales";

export type Crs = "WGS84" | "GCJ-02";

export type PlaceLocation = {
  lat: number;
  lng: number;
  crs: Crs;
};

export type PlaceSource = {
  provider: ProviderId;
  native_id: string;
  logo_url?: string;
  deeplinks: Record<string, string>;
};

export type PlaceCard = {
  provider: ProviderId;
  primary_provider?: ProviderId;
  name: string;
  address?: string;
  location: PlaceLocation;
  rating?: number;
  hours?: string;
  category?: string;
  phone?: string;
  photos?: string[];
  price_level?: string;
  price_per_person?: number;
  sources: PlaceSource[];
  tripadvisor?: {
    rating?: number;
    review_count?: number;
    url?: string;
  };
  /** ADR-045 §4: marks pool cards identified as must-see / iconic. Signal travels with the card. */
  must_see?: boolean;
};

export type SearchInput = {
  query?: string;
  near?: { lat: number; lng: number; crs?: Crs };
  address?: string;
  open_now?: boolean;
  cuisine?: string;
  providers?: string[];
  locale?: Locale;
  locales?: Locale[];
  merge?: boolean;
  enrich?: { tripadvisor?: boolean };
  /**
   * Google Places searchText RankPreference (ADR-043 revised).
   * API allows only RELEVANCE | DISTANCE — never POPULARITY (400 INVALID_ARGUMENT).
   * Ignored by other adapters.
   */
  rankPreference?: "RELEVANCE" | "DISTANCE";
};

export type ItineraryBounds = {
  start: string;
  end: string;
};

export type ItineraryPreferences = {
  pace?: "tight" | "medium" | "relaxed";
  spend?: "budget" | "premium";
  transit_preferred?: boolean;
  natural_language?: string;
};

export type ItineraryStop = {
  place: PlaceCard;
  order: number;
};

export type ItineraryDayWeather = {
  weather_code: number;
  label_key: string;
  label: string;
  temp_max_c?: number;
  temp_min_c?: number;
  provider: "OPEN_METEO";
};

export type ItineraryDay = {
  day_index: number;
  date: string;
  stops: ItineraryStop[];
  weather?: ItineraryDayWeather;
};

export type ItineraryPlan = {
  detail?: "stops";
  days: ItineraryDay[];
  preferences_applied: ItineraryPreferences;
};

export type PlanItineraryOrigin = {
  name?: string;
  lat?: number;
  lng?: number;
};

export type PlanItineraryInput = {
  detail?: "stops" | "timed";
  origin?: PlanItineraryOrigin;
  destination?: PlanItineraryOrigin;
  timezone?: string;
  bounds?: ItineraryBounds;
  places?: PlaceCard[];
  preferences?: ItineraryPreferences;
  providers?: string[];
  locale?: Locale;
  locales?: Locale[];
  /** ADR-040 D6 */
  party_size?: number;
};

export type ToolResult<T> = {
  data: T;
  skipped: { provider: string; reason_key: string }[];
  locale: Locale;
  locales?: Locale[];
  outcomeKey?: string;
};
