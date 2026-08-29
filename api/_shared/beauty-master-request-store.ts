export type BeautyMasterRequestRow = {
  requestId: string;
  submittedAt: string;
  status: string;
  sourceLanguage: string;
  profession: string;
  publicName: string;
  city: string;
  translatedPayloadJson: string;
  normalizedWorkspacePayloadJson: string;
  translationValidationStatus: string;
};

export interface BeautyMasterRequestStore {
  listRequests(): Promise<BeautyMasterRequestRow[]>;
}

const requestIdPattern = /^GROOMING018-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => typeof value === "string" ? value : "";

export const normalizeBeautyMasterRequest = (value: unknown): BeautyMasterRequestRow | null => {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const requestId = text(row.requestId).trim();
  if (!requestIdPattern.test(requestId)) return null;
  const status = text(row.status).trim();
  if (status.toLowerCase() === "rejected") return null;
  return {
    requestId,
    submittedAt: text(row.submittedAt).trim(),
    status,
    sourceLanguage: text(row.sourceLanguage).trim(),
    profession: text(row.profession).trim(),
    publicName: text(row.publicName).trim(),
    city: text(row.city).trim(),
    translatedPayloadJson: text(row.translatedPayloadJson),
    normalizedWorkspacePayloadJson: text(row.normalizedWorkspacePayloadJson),
    translationValidationStatus: text(row.translationValidationStatus).trim(),
  };
};

const requiredColumns = {
  requestId: "request_id",
  submittedAt: "submitted_at",
  status: "status",
  sourceLanguage: "source_language",
  profession: "profession",
  publicName: "public_name",
  city: "city",
  translatedPayloadJson: "translated_payload_json",
  normalizedWorkspacePayloadJson: "normalized_workspace_payload_json",
  translationValidationStatus: "translation_validation_status",
} as const;

export const parseBeautyMasterRequestSheetValues = (values: unknown): BeautyMasterRequestRow[] => {
  if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) return [];
  const headers = values[0].map((value) => text(value).trim());
  const indexes = Object.fromEntries(
    Object.entries(requiredColumns).map(([field, column]) => [field, headers.indexOf(column)]),
  ) as Record<keyof typeof requiredColumns, number>;

  if (Object.values(indexes).some((index) => index < 0)) {
    throw new Error("beauty_master_requests_sheet_headers_invalid");
  }

  return values.slice(1)
    .filter(Array.isArray)
    .map((row) => normalizeBeautyMasterRequest({
      requestId: row[indexes.requestId],
      submittedAt: row[indexes.submittedAt],
      status: row[indexes.status],
      sourceLanguage: row[indexes.sourceLanguage],
      profession: row[indexes.profession],
      publicName: row[indexes.publicName],
      city: row[indexes.city],
      translatedPayloadJson: row[indexes.translatedPayloadJson],
      normalizedWorkspacePayloadJson: row[indexes.normalizedWorkspacePayloadJson],
      translationValidationStatus: row[indexes.translationValidationStatus],
    }))
    .filter((row): row is BeautyMasterRequestRow => Boolean(row));
};
