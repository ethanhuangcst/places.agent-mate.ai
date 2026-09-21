import { type VisaRequirementData } from "./types";

function isUpgradePlaceholder(value: unknown): value is { upgrade: string } {
  return (
    value != null &&
    typeof value === "object" &&
    "upgrade" in value &&
    typeof (value as { upgrade?: unknown }).upgrade === "string"
  );
}

function looksLikeUpgradeCopy(value: string): boolean {
  return /upgrade|requires pro|starter plan|pro plan/i.test(value);
}

function collectUnavailableFields(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [field, value] of Object.entries(raw)) {
    if (isUpgradePlaceholder(value)) out.push(field);
  }
  return out;
}

function honestString(value: unknown): string | undefined {
  if (isUpgradePlaceholder(value)) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text || looksLikeUpgradeCopy(text)) return undefined;
  return text;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((v) => honestString(v))
    .filter((v): v is string => Boolean(v));
  return items.length ? items : undefined;
}

function honestHttpUrl(value: unknown): string | null {
  const text = honestString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") return text;
  } catch {
    return null;
  }
  return null;
}

export function mapOriznVisaPayload(
  passport: string,
  destination: string,
  raw: Record<string, unknown>,
): VisaRequirementData {
  const documents =
    asStringArray(raw.documents_required) ?? asStringArray(raw.documents);
  const process = asStringArray(raw.process);
  const extensionRaw = raw.extension;
  const extension =
    extensionRaw && typeof extensionRaw === "object" && !isUpgradePlaceholder(extensionRaw)
      ? {
          possible: Boolean((extensionRaw as { possible?: boolean }).possible),
          details: honestString((extensionRaw as { details?: unknown }).details),
        }
      : undefined;

  const lastVerified =
    honestString(raw.last_verified_at) ?? honestString(raw.last_verified) ?? null;

  const sourceUrl =
    honestHttpUrl(raw.source_url) ??
    (typeof raw.source === "string" && raw.source.startsWith("http")
      ? honestHttpUrl(raw.source)
      : null);

  const unavailable = collectUnavailableFields(raw);

  return {
    passport,
    destination,
    requirement: String(raw.requirement ?? "unknown"),
    visa_free_days:
      typeof raw.visa_free_days === "number"
        ? raw.visa_free_days
        : raw.visa_free_days === null
          ? null
          : null,
    description: honestString(raw.description),
    documents,
    process,
    processing_time: honestString(raw.processing_time),
    cost: honestString(raw.cost),
    validity: honestString(raw.validity),
    max_stay: honestString(raw.max_stay),
    embassy: honestString(raw.embassy),
    transit_visa: honestString(raw.transit_visa),
    extension,
    last_verified: lastVerified,
    source_url: sourceUrl,
    unavailable_fields: unavailable.length ? unavailable : undefined,
  };
}
