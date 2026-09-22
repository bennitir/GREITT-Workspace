import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeIcelandAddressSearch } from "@/lib/work10/iceland-address";

export async function GET(request: NextRequest) {
  const raw = String(request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  const query = normalizeIcelandAddressSearch(raw);
  if (query.length < 2) return NextResponse.json({ items: [] });

  const rows = await prisma.icelandAddress.findMany({
    where: {
      OR: [
        { displaySearch: { startsWith: query } },
        { streetSearch: { startsWith: query } },
        { specialSearch: { startsWith: query } },
      ],
    },
    orderBy: [
      { streetName: "asc" },
      { houseNumberSort: "asc" },
      { houseLetter: "asc" },
    ],
    take: 10,
    select: {
      hnitnum: true,
      postalCode: true,
      addressText: true,
      displayText: true,
      latitude: true,
      longitude: true,
    },
  });

  return NextResponse.json({
    items: rows.map((row) => ({
      id: null,
      externalId: row.hnitnum,
      source: "HMS",
      name: row.addressText,
      address: row.addressText,
      postalCode: row.postalCode,
      city: null,
      displayText: row.displayText,
      inputText: row.displayText,
      searchText: row.displayText,
      latitude: row.latitude,
      longitude: row.longitude,
    })),
  });
}
