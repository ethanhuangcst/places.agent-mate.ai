import { type VisaRequirementData } from "./types";

function isUpgradePlaceholder(value: unknown): value is { upgrade: string } {
  return (
    value != null &&
    typeof value === "object" &&
    "upgrade" in value &&
    typeof (value as { upgrade?: unknown }).upgrade === "string"
  );
}

function collectUnavailableFields(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [field, value] of Object.entries(raw)) {
    if (isUpgradePlaceholder(value)) out.push(field);
  }
  return out;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((v) => typeof v === "string") as string[];
  return items.length ? items : undefined;
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
    extensionRaw && typeof extensionRaw === "object"
      ? {
          possible: Boolean((extensionRaw as { possible?: boolean }).possible),
          details:
            typeof (extensionRaw as { details?: unknown }).details === "string"
              ? ((extensionRaw as { details: string }).details as string)
              : undefined,
        }
      : undefined;

  const lastVerified =
    (typeof raw.last_verified_at === "string" ? raw.last_verified_at : null) ??
    (typeof raw.last_verified === "string" ? raw.last_verified : null);

  const sourceUrl =
    typeof raw.source_url === "string"
      ? raw.source_url
      : typeof raw.source === "string" && raw.source.startsWith("http")
        ? raw.source
        : null;

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
    description: typeof raw.description === "string" ? raw.description : undefined,
    documents,
    process,
    processing_time:
      typeof raw.processing_time === "string" ? raw.processing_time : undefined,
    validity: typeof raw.validity === "string" ? raw.validity : undefined,
    max_stay: typeof raw.max_stay === "string" ? raw.max_stay : undefined,
    extension,
    last_verified: lastVerified,
    source_url: sourceUrl,
    unavailable_fields: unavailable.length ? unavailable : undefined,
  };
}
