import { prisma } from "@/lib/prisma";

export const HMS_ADDRESS_SOURCE_URL =
  "https://hmsstgsftpprodweu001.blob.core.windows.net/fasteignaskra/Stadfangaskra.csv";

export function normalizeIcelandAddressSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("is")
    .replace(/[^a-z0-9áðéíóúýþæö\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function resolveHmsOperationalLocation(input: {
  companyId: number;
  hnitnum: string | null | undefined;
}) {
  const hnitnum = String(input.hnitnum ?? "").trim();
  if (!hnitnum) return null;

  const address = await prisma.icelandAddress.findUnique({
    where: { hnitnum },
    select: {
      hnitnum: true,
      postalCode: true,
      streetName: true,
      houseNumber: true,
      houseLetter: true,
      suffix: true,
      specialName: true,
      addressText: true,
      displayText: true,
      latitude: true,
      longitude: true,
    },
  });
  if (!address) return null;

  const code = `HMS-${address.hnitnum}`;
  const name = address.specialName?.trim() || address.addressText;

  const location = await prisma.operationalLocation.upsert({
    where: { companyId_code: { companyId: input.companyId, code } },
    create: {
      companyId: input.companyId,
      code,
      name,
      address: address.addressText,
      postalCode: address.postalCode,
      city: null,
      latitude: address.latitude,
      longitude: address.longitude,
      locationKind: "SITE",
      isActive: true,
      notes: `HMS Staðfangaskrá · HNITNUM ${address.hnitnum}`,
    },
    update: {
      name,
      address: address.addressText,
      postalCode: address.postalCode,
      latitude: address.latitude,
      longitude: address.longitude,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      address: true,
      postalCode: true,
      city: true,
      latitude: true,
      longitude: true,
    },
  });

  return { location, displayText: address.displayText };
}
