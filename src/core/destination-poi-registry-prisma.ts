import { type PrismaClient } from "@prisma/client";
import { type PlaceCard } from "./types";
import {
  destinationLookupKey,
  normalizeCityQuery,
  type AttractionPoiRow,
  type DestinationAnchor,
  type PoiRegistryStore,
  cardSlimFromPlace,
} from "./destination-poi-registry";

function asCard(raw: unknown): PlaceCard {
  return raw as PlaceCard;
}

function asAliases(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

export function createPrismaPoiRegistryStore(client: PrismaClient): PoiRegistryStore {
  return {
    async getOrCreateDestination(anchor: DestinationAnchor) {
      const lookupKey = destinationLookupKey(anchor);
      const row = await client.destination.upsert({
        where: { lookupKey },
        create: {
          lookupKey,
          provider: anchor.provider ?? "GEO",
          placeId: anchor.placeId ?? null,
          queryNorm: normalizeCityQuery(anchor.city),
          lat: anchor.lat ?? null,
          lng: anchor.lng ?? null,
        },
        update: {
          lat: anchor.lat ?? undefined,
          lng: anchor.lng ?? undefined,
          placeId: anchor.placeId ?? undefined,
        },
      });
      return { id: row.id, lookupKey: row.lookupKey };
    },
    async upsertPoi(destinationId, card, native) {
      const slim = cardSlimFromPlace(card);
      const row = await client.attractionPoi.upsert({
        where: {
          destinationId_provider_nativeId: {
            destinationId,
            provider: native.provider,
            nativeId: native.nativeId,
          },
        },
        create: {
          destinationId,
          provider: native.provider,
          nativeId: native.nativeId,
          name: card.name,
          aliases: [],
          lat: card.location.lat,
          lng: card.location.lng,
          cardSlim: slim as object,
        },
        update: {
          name: card.name,
          lat: card.location.lat,
          lng: card.location.lng,
          cardSlim: slim as object,
        },
      });
      return { id: row.id };
    },
    async getPoi(poiId) {
      const r = await client.attractionPoi.findUnique({ where: { id: poiId } });
      if (!r) return null;
      return {
        id: r.id,
        destinationId: r.destinationId,
        provider: r.provider,
        nativeId: r.nativeId,
        name: r.name,
        aliases: asAliases(r.aliases),
        lat: r.lat,
        lng: r.lng,
        cardSlim: asCard(r.cardSlim),
        details: r.details && typeof r.details === "object" ? (r.details as Record<string, unknown>) : null,
        detailsFetchedAt: r.detailsFetchedAt,
      };
    },
    async listPois(destinationId) {
      const rows = await client.attractionPoi.findMany({ where: { destinationId } });
      return rows.map(
        (r): AttractionPoiRow => ({
          id: r.id,
          destinationId: r.destinationId,
          provider: r.provider,
          nativeId: r.nativeId,
          name: r.name,
          aliases: asAliases(r.aliases),
          lat: r.lat,
          lng: r.lng,
          cardSlim: asCard(r.cardSlim),
          details: r.details && typeof r.details === "object" ? (r.details as Record<string, unknown>) : null,
          detailsFetchedAt: r.detailsFetchedAt,
        }),
      );
    },
    async updatePoiDetails(poiId, details, fetchedAt) {
      await client.attractionPoi.update({
        where: { id: poiId },
        data: { details: details as object, detailsFetchedAt: fetchedAt },
      });
    },
  };
}
