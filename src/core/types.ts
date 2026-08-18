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
  sources: PlaceSource[];
};

export type SearchInput = {
  query?: string;
  near?: { lat: number; lng: number };
  address?: string;
  open_now?: boolean;
  cuisine?: string;
  providers?: string[];
  locale?: Locale;
  locales?: Locale[];
  merge?: boolean;
};

export type ToolResult<T> = {
  data: T;
  skipped: { provider: string; reason_key: string }[];
  locale: Locale;
  locales?: Locale[];
  outcomeKey?: string;
};
