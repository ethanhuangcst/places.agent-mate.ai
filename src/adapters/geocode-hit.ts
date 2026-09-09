import { type PlaceLocation } from "../core/types";

/** Forward-geocode hit with optional structured admin labels (MVP-T2 / agent-geocode-100). */
export type GeocodeHit = PlaceLocation & {
  address?: string;
  country?: string;
  city?: string;
  city_en?: string;
};

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

function componentName(
  components: AddressComponent[],
  type: string,
): string | undefined {
  const hit = components.find((c) => c.types?.includes(type));
  const name = hit?.long_name?.trim() || hit?.short_name?.trim();
  return name || undefined;
}

/** Parse Google Geocoding `address_components` into country / city. */
export function parseGoogleAddressComponents(
  components: AddressComponent[] | undefined,
): { country?: string; city?: string } {
  if (!components?.length) return {};
  const country = componentName(components, "country");
  const city =
    componentName(components, "locality") ||
    componentName(components, "postal_town") ||
    componentName(components, "administrative_area_level_2") ||
    componentName(components, "administrative_area_level_1");
  return { country, city };
}

/** AMAP geocode row → country / city (no city_en). */
export function parseAmapGeocodeAdmin(row: {
  country?: string;
  province?: string;
  city?: string;
  district?: string;
}): { country?: string; city?: string } {
  const country = row.country?.trim() || undefined;
  const city =
    row.city?.trim() ||
    row.district?.trim() ||
    row.province?.trim() ||
    undefined;
  return { country, city };
}
