import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const SOURCE_URL = "https://hmsstgsftpprodweu001.blob.core.windows.net/fasteignaskra/Stadfangaskra.csv";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL vantar í .env");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("is")
    .replace(/[^a-z0-9áðéíóúýþæö\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function numberValue(value: string | undefined) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: string | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function* csvRows(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let pendingQuote = false;

  const consume = async function* (text: string) {
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (pendingQuote) {
        pendingQuote = false;
        if (ch === '"') {
          field += '"';
          continue;
        }
        inQuotes = false;
      }
      if (ch === '"') {
        if (inQuotes) {
          if (i + 1 < text.length) {
            if (text[i + 1] === '"') {
              field += '"';
              i += 1;
            } else {
              inQuotes = false;
            }
          } else {
            pendingQuote = true;
          }
        } else {
          inQuotes = true;
        }
        continue;
      }
      if (!inQuotes && ch === ",") {
        row.push(field);
        field = "";
        continue;
      }
      if (!inQuotes && ch === "\n") {
        if (field.endsWith("\r")) field = field.slice(0, -1);
        row.push(field);
        field = "";
        const finished = row;
        row = [];
        yield finished;
        continue;
      }
      field += ch;
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    for await (const parsed of consume(decoder.decode(value, { stream: true }))) yield parsed;
  }
  for await (const parsed of consume(decoder.decode())) yield parsed;
  if (field.length || row.length) {
    row.push(field);
    yield row;
  }
}

async function main() {
  console.log(`Sæki HMS Staðfangaskrá: ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL, { headers: { "user-agent": "GLOGGT-address-import/1.0" } });
  if (!response.ok || !response.body) throw new Error(`HMS svaraði ${response.status}`);

  const iterator = csvRows(response.body);
  const first = await iterator.next();
  if (first.done) throw new Error("Staðfangaskrá var tóm.");
  const header = first.value.map((value, index) => index === 0 ? value.replace(/^\uFEFF/, "").trim() : value.trim());
  const index = new Map(header.map((name, i) => [name.toUpperCase(), i]));
  for (const required of ["HNITNUM", "HEITI_NF", "POSTNR", "N_HNIT_WGS84", "E_HNIT_WGS84"]) {
    if (!index.has(required)) throw new Error(`Dálk vantar í HMS skrá: ${required}`);
  }

  const get = (row: string[], key: string) => String(row[index.get(key) ?? -1] ?? "").trim();
  console.log("HMS haus staðfestur. Hreinsa eldri innflutning...");
  await prisma.icelandAddress.deleteMany();

  const batch: any[] = [];
  let imported = 0;
  let skipped = 0;

  async function flush() {
    if (!batch.length) return;
    await prisma.icelandAddress.createMany({ data: batch.splice(0, batch.length), skipDuplicates: true });
  }

  for await (const row of iterator) {
    const hnitnum = get(row, "HNITNUM");
    const streetName = get(row, "HEITI_NF");
    if (!hnitnum || !streetName) {
      skipped += 1;
      continue;
    }

    const houseNumber = get(row, "HUSNR") || null;
    const houseLetter = get(row, "BOKST") || null;
    const suffix = get(row, "VIDSK") || null;
    const specialName = get(row, "SERHEITI") || null;
    const houseMark = get(row, "HUSMERKING") || [houseNumber, houseLetter].filter(Boolean).join("");
    const addressText = `${streetName}${houseMark ? ` ${houseMark}` : ""}${suffix ? ` ${suffix}` : ""}`.trim();
    const postalCode = get(row, "POSTNR") || null;
    const displayText = [addressText, postalCode].filter(Boolean).join(", ");

    batch.push({
      hnitnum,
      heinum: get(row, "HEINUM") || null,
      landnr: get(row, "LANDNR") || null,
      municipalityCode: get(row, "SVFNR") || null,
      postalCode,
      streetName,
      houseNumber,
      houseNumberSort: houseNumber && /^\d+$/.test(houseNumber) ? Number(houseNumber) : null,
      houseLetter,
      suffix,
      specialName,
      addressText,
      displayText,
      streetSearch: normalize(`${streetName}${houseMark ? ` ${houseMark}` : ""}`),
      specialSearch: specialName ? normalize(specialName) : null,
      displaySearch: normalize(`${displayText} ${specialName ?? ""}`),
      latitude: numberValue(get(row, "N_HNIT_WGS84")),
      longitude: numberValue(get(row, "E_HNIT_WGS84")),
      sourceUpdatedAt: dateValue(get(row, "DAGS_LEIDR")),
    });
    imported += 1;
    if (batch.length >= 1000) await flush();
    if (imported % 10000 === 0) console.log(`Innflutt: ${imported.toLocaleString("is-IS")}`);
  }
  await flush();
  const count = await prisma.icelandAddress.count();
  console.log(`Lokið. ${count.toLocaleString("is-IS")} staðföng vistuð. Slept: ${skipped.toLocaleString("is-IS")}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
