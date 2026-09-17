/**
 * Vendor place pointers that can be used with get_place_details / deeplinks.
 * Rejects harness and invented ids (e.g. verify_belem from POC scripts / LLM).
 */
export function isResolvablePlaceNativeId(
  provider: string | undefined,
  nativeId: string | undefined,
): boolean {
  const id = nativeId?.trim();
  if (!id) return false;
  if (/^(verify_|fixture_|test_|fake_|placeholder_)/i.test(id)) return false;
  if (/example\.com/i.test(id)) return false;

  const p = (provider ?? "").toUpperCase().replace(/-/g, "_");
  if (p === "GOOGLE_MAPS" || p === "GOOGLE" || p === "GMAPS") {
    return /^ChIJ[\w-]+$/.test(id) || /^places\//i.test(id);
  }
  if (p === "AMAP") {
    // POI ids are usually B0…; bus/metro stops often BV… (both work with place/detail).
    return /^(B0|BV)[A-Z0-9]+$/i.test(id);
  }
  if (p === "TRIPADVISOR") {
    return /^\d{4,}$/.test(id);
  }
  return id.length >= 8 && !/\s/.test(id) && !/^[a-z]+_[a-z0-9_]+$/i.test(id);
}
