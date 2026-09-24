export type CityPostersPromotionOccurrence = {
  starts_at?: string | null;
  ends_at?: string | null;
};

export function cityPostersPromotionExpiryMs(event: CityPostersPromotionOccurrence | null | undefined): number | null {
  if (!event?.ends_at) return null;
  const expiry = new Date(event.ends_at).getTime();
  return Number.isFinite(expiry) ? expiry : null;
}

export function isCityPostersPromotionActive(
  event: CityPostersPromotionOccurrence | null | undefined,
  nowMs = Date.now(),
): boolean {
  const expiry = cityPostersPromotionExpiryMs(event);
  return expiry !== null && expiry > nowMs;
}
