import type { PlaceCard } from "./types";

/** User-typed must_include intent — orthogonal to discover heat (`must_see`). */
export function markUserRequested(card: PlaceCard): void {
  card.user_requested = true;
}
