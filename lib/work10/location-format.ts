export type OperationalLocationLike = {
  name?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
};

export function normalizeLocationCity(postalCode: string | null | undefined, city: string | null | undefined) {
  const postal = String(postalCode ?? "").trim();
  const rawCity = String(city ?? "").trim();
  if (!postal || !rawCity) return rawCity;
  const escaped = postal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return rawCity.replace(new RegExp(`^${escaped}(?:\\s+|,\\s*)`, "i"), "").trim();
}

export function postalCityLabel(postalCode: string | null | undefined, city: string | null | undefined) {
  const postal = String(postalCode ?? "").trim();
  const normalizedCity = normalizeLocationCity(postal, city);
  return [postal, normalizedCity].filter(Boolean).join(" ");
}

export function operationalLocationAddress(location: OperationalLocationLike | null | undefined) {
  if (!location) return "";
  return [String(location.address ?? "").trim(), postalCityLabel(location.postalCode, location.city)]
    .filter(Boolean)
    .join(", ");
}

export function operationalLocationLabel(location: OperationalLocationLike | null | undefined) {
  if (!location) return "";
  return [String(location.name ?? "").trim(), String(location.address ?? "").trim(), postalCityLabel(location.postalCode, location.city)]
    .filter(Boolean)
    .join(" · ");
}
