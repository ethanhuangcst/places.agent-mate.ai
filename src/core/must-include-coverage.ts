/**
 * ADR-043 D7 — must_include hard coverage (shared by HTTP + MCP arrangeDay).
 * day_theme alone never counts as covered.
 */

import {
  mustIncludeTokenCovered,
  normalizeMustIncludeToken,
} from "./trip-intake";
import type { PlaceCard } from "./types";

/** Day-trip town radius: tight enough that Belém ≠ Cascais, Queluz ≠ Sintra center. */
export const MUST_INCLUDE_RADIUS_KM = 10;

export type MustIncludeCoverageSnapshot = {
  must_include: string[];
  covered: string[];
  missing: string[];
};

export type GeoAnchor = {
  lat: number;
  lng: number;
  /** Geocoder display / alias strings for name match. */
  aliases: string[];
};

type SessionEntry = {
  must_include: string[];
  covered: string[];
  at: number;
};

const sessionByKey = new Map<string, SessionEntry>();
const TTL_MS = 60 * 60 * 1000;

export function mustIncludeCoverageKey(input: {
  city?: string;
  originName?: string;
  locale?: string;
}): string {
  return [
    (input.city ?? "").trim().toLowerCase(),
    (input.originName ?? "").trim().toLowerCase(),
    (input.locale ?? "EN").trim().toUpperCase(),
  ].join("|");
}

/** For tests. */
export function resetMustIncludeCoverageSessions(): void {
  sessionByKey.clear();
}

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Pick one still-missing token for this arrange call.
 * Restricts to tokens in the call's must_include list (so an explicit user
 * subset takes priority over sticky session-wide tokens). Prefer day_theme
 * alignment; else first missing in list order.
 */
export function selectMustIncludeFocusToken(input: {
  must_include: string[];
  missing: string[];
  day_theme?: string;
}): string | null {
  const mustSet = new Set(
    input.must_include.map((s) => normalizeMustIncludeToken(s)).filter(Boolean),
  );
  // When the call provides a must_include list, focus only on missing tokens
  // that are in it (user intent first). When empty, the caller has already
  // recovered the sticky session list into must_include.
  const missing = input.missing
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((t) => (mustSet.size === 0 ? true : mustSet.has(normalizeMustIncludeToken(t))));
  if (!missing.length) return null;
  // ADR-043 D9 精简 follow-up: theme-gated focus. Only force a must_include
  // focus on a day whose day_theme names a missing token — this lets the host
  // assign day-trip towns (e.g. 辛特拉一日) to the right day instead of the
  // server pre-empting them onto an earlier non-themed day as a half-day.
  // No theme, or theme names something else → no forced focus; the token stays
  // for a future themed day, and the last-day gate still guarantees coverage.
  const theme = input.day_theme?.trim() ?? "";
  if (!theme) return null;
  for (const token of missing) {
    if (mustIncludeTokenCovered(token, [theme])) return token;
  }
  return null;
}

function placeNativeIds(p: PlaceCard): string[] {
  return (p.sources ?? [])
    .map((s) => s.native_id)
    .filter((id): id is string => Boolean(id?.trim()));
}

export function mergeMustIncludeIntoCandidates(
  candidates: { places: PlaceCard[]; restaurants: PlaceCard[] },
  pool: PlaceCard[],
): { places: PlaceCard[]; restaurants: PlaceCard[] } {
  if (!pool.length) return candidates;
  const seen = new Set(
    candidates.places.map(
      (p) =>
        `${normalizeMustIncludeToken(p.name)}|${placeNativeIds(p)[0] ?? ""}`,
    ),
  );
  const extra: PlaceCard[] = [];
  for (const p of pool) {
    const key = `${normalizeMustIncludeToken(p.name)}|${placeNativeIds(p)[0] ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(p);
  }
  return {
    places: [...candidates.places, ...extra],
    restaurants: candidates.restaurants,
  };
}

function blockIsTransitOnly(type?: string): boolean {
  const t = (type ?? "").toLowerCase();
  return t === "transit" || t === "transfer" || t === "transport";
}

/**
 * True if this block evidences the focus must_include token.
 */
export function blockCoversMustIncludeToken(input: {
  token: string;
  blockName: string;
  blockType?: string;
  blockLocation?: { lat: number; lng: number } | null;
  blockAddress?: string;
  blockNativeIds?: string[];
  focusPool: PlaceCard[];
  anchor?: GeoAnchor | null;
}): boolean {
  if (blockIsTransitOnly(input.blockType)) return false;
  const token = input.token.trim();
  if (!token) return false;

  const poolNames = new Set(
    input.focusPool.map((p) => normalizeMustIncludeToken(p.name)),
  );
  const poolIds = new Set(
    input.focusPool.flatMap((p) => placeNativeIds(p).map((id) => id.trim())),
  );

  const nameN = normalizeMustIncludeToken(input.blockName);
  if (poolNames.has(nameN)) return true;
  for (const id of input.blockNativeIds ?? []) {
    if (id && poolIds.has(id)) return true;
  }

  const blockHay = [input.blockName, input.blockAddress ?? ""].filter((s) =>
    Boolean(s?.trim()),
  );
  const nameHit =
    mustIncludeTokenCovered(token, blockHay) ||
    (input.anchor?.aliases ?? []).some((a) =>
      mustIncludeTokenCovered(a, blockHay),
    );

  if (!nameHit) return false;

  if (input.anchor && input.blockLocation?.lat != null && input.blockLocation?.lng != null) {
    return (
      haversineKm(input.anchor, input.blockLocation) <= MUST_INCLUDE_RADIUS_KM
    );
  }
  return false;
}

function getOrCreateSession(
  key: string,
  must_include: string[],
): SessionEntry {
  const now = Date.now();
  let entry = sessionByKey.get(key);
  if (entry && now - entry.at > TTL_MS) {
    sessionByKey.delete(key);
    entry = undefined;
  }
  const incoming = must_include.map((s) => s.trim()).filter(Boolean);
  if (!entry) {
    entry = { must_include: incoming, covered: [], at: now };
  } else {
    const seen = new Set(entry.must_include.map(normalizeMustIncludeToken));
    for (const name of incoming) {
      const n = normalizeMustIncludeToken(name);
      if (n && !seen.has(n)) {
        entry.must_include.push(name);
        seen.add(n);
      }
    }
    entry.at = now;
  }
  sessionByKey.set(key, entry);
  return entry;
}

function snapshot(entry: SessionEntry): MustIncludeCoverageSnapshot {
  const missing = entry.must_include.filter(
    (t) =>
      !entry.covered.some(
        (c) => normalizeMustIncludeToken(c) === normalizeMustIncludeToken(t),
      ),
  );
  return {
    must_include: [...entry.must_include],
    covered: [...entry.covered],
    missing,
  };
}

/**
 * Apply hard evidence from this day's blocks; never uses day_theme.
 */
export function applyMustIncludeDayEvidence(input: {
  key: string;
  must_include?: string[];
  blocks: Array<{
    name: string;
    type?: string;
    location?: { lat: number; lng: number } | null;
    address?: string;
    native_ids?: string[];
  }>;
  /** Focus token searched this call (optional). */
  focusToken?: string | null;
  focusPool?: PlaceCard[];
  focusAnchor?: GeoAnchor | null;
  /** All candidates for resolving block → location / native_id. */
  candidates?: PlaceCard[];
}): MustIncludeCoverageSnapshot {
  const entry = getOrCreateSession(input.key, input.must_include ?? []);
  if (!entry.must_include.length) {
    return snapshot(entry);
  }

  const byName = new Map(
    (input.candidates ?? []).map((c) => [normalizeMustIncludeToken(c.name), c]),
  );

  const enrichedBlocks = input.blocks.map((b) => {
    const card = byName.get(normalizeMustIncludeToken(b.name));
    return {
      name: b.name,
      type: b.type,
      location: b.location ?? card?.location ?? null,
      address: b.address ?? card?.address,
      native_ids: b.native_ids ?? (card ? placeNativeIds(card) : []),
    };
  });

  for (const token of entry.must_include) {
    const already = entry.covered.some(
      (c) => normalizeMustIncludeToken(c) === normalizeMustIncludeToken(token),
    );
    if (already) continue;

    const isFocus =
      input.focusToken &&
      normalizeMustIncludeToken(input.focusToken) ===
        normalizeMustIncludeToken(token);
    const pool = isFocus ? (input.focusPool ?? []) : [];
    const anchor = isFocus ? (input.focusAnchor ?? null) : null;

    // Also allow pool/name evidence for any token via block name substring
    // without theme — and for non-focus, try name-only against token.
    const hit = enrichedBlocks.some((b) => {
      if (blockCoversMustIncludeToken({
        token,
        blockName: b.name,
        blockType: b.type,
        blockLocation: b.location,
        blockAddress: b.address,
        blockNativeIds: b.native_ids,
        focusPool: pool,
        anchor,
      })) {
        return true;
      }
      // Non-focus / no pool: block name or address contains the token string
      if (!blockIsTransitOnly(b.type)) {
        return mustIncludeTokenCovered(token, [b.name, b.address ?? ""]);
      }
      return false;
    });

    if (hit) {
      entry.covered.push(token);
    }
  }

  sessionByKey.set(input.key, entry);
  return snapshot(entry);
}

export function getMustIncludeCoverageSnapshot(
  key: string,
): MustIncludeCoverageSnapshot {
  const entry = sessionByKey.get(key);
  if (!entry) return { must_include: [], covered: [], missing: [] };
  return snapshot(entry);
}

export function peekMissingMustInclude(
  key: string,
  must_include?: string[],
): string[] {
  if (must_include?.length) {
    getOrCreateSession(key, must_include);
  }
  return getMustIncludeCoverageSnapshot(key).missing;
}
