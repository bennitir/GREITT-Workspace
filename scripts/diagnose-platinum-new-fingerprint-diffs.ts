import { prisma } from "../lib/prisma";

const COMPANY_NAME = "Sturla Ólafsson";
const CARD_NAME = "Platinum";
const TARGET_FILE = "Platinumvisa 4.6.2026 10.7.2026.xlsx";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function day(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function sameNullableNumber(a: unknown, b: unknown) {
  const na = num(a);
  const nb = num(b);
  if (na === null || nb === null) return na === nb;
  return Math.abs(na - nb) < 1e-9;
}

async function main() {
  console.log("=== PLATINUM NEW-vs-EXISTING FINGERPRINT DIAGNOSTIC ===");
  console.log("READ-ONLY — engar breytingar eru gerðar.\n");

  const company = await prisma.company.findFirst({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });
  if (!company) throw new Error("Fyrirtæki fannst ekki.");

  const card = await prisma.paymentCard.findFirst({
    where: {
      companyId: company.id,
      name: { contains: CARD_NAME, mode: "insensitive" },
      isActive: true,
    },
    select: { id: true, name: true },
  });
  if (!card) throw new Error("Platinum-kort fannst ekki.");

  const batch = await prisma.importBatch.findFirst({
    where: {
      companyId: company.id,
      paymentCardId: card.id,
      sourceType: "PAYMENT_CARD_STATEMENT_XLSX",
      fileName: TARGET_FILE,
      status: "PREVIEW",
    },
    orderBy: { createdAt: "desc" },
    include: {
      rows: {
        where: { status: "NEW" },
        orderBy: { rowNumber: "asc" },
      },
    },
  });

  if (!batch) {
    throw new Error(
      `PREVIEW-bunki fyrir "${TARGET_FILE}" fannst ekki. Ekki hætta við forskoðunina áður en þetta er keyrt.`,
    );
  }

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log(`Kort: ${card.name} (#${card.id})`);
  console.log(`Batch: #${batch.id} — ${batch.fileName}`);
  console.log(`Grænar NEW-línur: ${batch.rows.length}\n`);

  const summary = new Map<string, number>();
  let exactVisibleMatches = 0;
  let unresolved = 0;

  for (const row of batch.rows) {
    if (!row.date || !row.rawData) continue;
    const raw = JSON.parse(row.rawData) as Record<string, unknown>;
    const amount = num(raw.amount);
    const merchantText = text(raw.merchantText || row.text);
    const cardPeriod = text(raw.cardPeriod);

    const from = new Date(row.date);
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 1);

    const candidates = await prisma.paymentCardTransaction.findMany({
      where: {
        paymentCardId: card.id,
        date: { gte: from, lt: to },
        merchantText,
        ...(amount === null ? {} : { amount }),
        ...(cardPeriod ? { cardPeriod } : {}),
      },
      select: {
        id: true,
        date: true,
        merchantText: true,
        merchantCategory: true,
        foreignAmount: true,
        currency: true,
        exchangeRate: true,
        amount: true,
        explanation: true,
        cardPeriod: true,
        fingerprint: true,
        sourceFileName: true,
        createdAt: true,
      },
      orderBy: { id: "asc" },
    });

    console.log("------------------------------------------------------------");
    console.log(
      `NEW row ${row.rowNumber}: ${day(row.date)} | ${merchantText} | ${amount} | ${cardPeriod}`,
    );
    console.log(`newDateTime: ${iso(row.date)}`);
    console.log(`newFingerprint: ${text(raw.fingerprint)}`);

    if (candidates.length === 0) {
      unresolved++;
      console.log("ENGIN eldri færsla fannst með sama sýnilega lykli (dagur+söluaðili+upphæð+tímabil).");
      summary.set("NO_VISIBLE_MATCH", (summary.get("NO_VISIBLE_MATCH") ?? 0) + 1);
      continue;
    }

    exactVisibleMatches++;
    console.log(`Eldri sýnileg match: ${candidates.length}`);

    for (const existing of candidates) {
      const diffs: string[] = [];

      if (iso(existing.date) !== iso(row.date)) {
        diffs.push(`dateTime: ${iso(existing.date)} -> ${iso(row.date)}`);
      }
      if (text(existing.merchantText) !== text(raw.merchantText)) {
        diffs.push(
          `merchantText: ${JSON.stringify(existing.merchantText)} -> ${JSON.stringify(raw.merchantText)}`,
        );
      }
      if (text(existing.merchantCategory) !== text(raw.merchantCategory)) {
        diffs.push(
          `merchantCategory: ${JSON.stringify(existing.merchantCategory)} -> ${JSON.stringify(raw.merchantCategory)}`,
        );
      }
      if (!sameNullableNumber(existing.foreignAmount, raw.foreignAmount)) {
        diffs.push(`foreignAmount: ${existing.foreignAmount ?? null} -> ${raw.foreignAmount ?? null}`);
      }
      if (text(existing.currency) !== text(raw.currency)) {
        diffs.push(
          `currency: ${JSON.stringify(existing.currency)} -> ${JSON.stringify(raw.currency)}`,
        );
      }
      if (!sameNullableNumber(existing.exchangeRate, raw.exchangeRate)) {
        diffs.push(`exchangeRate: ${existing.exchangeRate ?? null} -> ${raw.exchangeRate ?? null}`);
      }
      if (!sameNullableNumber(existing.amount, raw.amount)) {
        diffs.push(`amount: ${existing.amount} -> ${raw.amount}`);
      }
      if (text(existing.explanation) !== text(raw.explanation)) {
        diffs.push(
          `explanation: ${JSON.stringify(existing.explanation)} -> ${JSON.stringify(raw.explanation)}`,
        );
      }
      if (text(existing.cardPeriod) !== text(raw.cardPeriod)) {
        diffs.push(
          `cardPeriod: ${JSON.stringify(existing.cardPeriod)} -> ${JSON.stringify(raw.cardPeriod)}`,
        );
      }

      const reason =
        diffs.length === 1 && diffs[0].startsWith("dateTime:")
          ? "ONLY_DATETIME"
          : diffs.length === 0
            ? "NO_COMPONENT_DIFF_BUT_FINGERPRINT_DIFF"
            : diffs.map((d) => d.split(":")[0]).sort().join("+");

      summary.set(reason, (summary.get(reason) ?? 0) + 1);

      console.log(
        `DB tx #${existing.id} | source=${existing.sourceFileName} | created=${iso(existing.createdAt)}`,
      );
      console.log(`oldDateTime: ${iso(existing.date)}`);
      console.log(`oldFingerprint: ${existing.fingerprint}`);
      console.log(`MUNUR: ${diffs.length ? diffs.join(" ; ") : "ENGINN í fingerprint-þáttum"}`);
      console.log(`Flokkun: ${reason}`);
    }
  }

  console.log("\n=== SAMANTEKT ===");
  console.log(`NEW-línur alls: ${batch.rows.length}`);
  console.log(`Með eldri sýnilega samsvörun: ${exactVisibleMatches}`);
  console.log(`Án sýnilegrar samsvörunar: ${unresolved}`);
  for (const [reason, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${reason}: ${count}`);
  }

  console.log("\nTúlkun:");
  console.log(
    "- ONLY_DATETIME = sama færsla í öllum öðrum fingerprint-þáttum, en falinn tími í Dagsetning er annar.",
  );
  console.log(
    "- merchantCategory / exchangeRate o.s.frv. = sá þáttur breyttist milli útgáfa skrárinnar.",
  );
  console.log(
    "- NO_COMPONENT_DIFF_BUT_FINGERPRINT_DIFF = þá þarf að skoða serialization/fingerprint nánar.",
  );
}

main()
  .catch((error) => {
    console.error("\nDIAGNOSTIC_FAILED");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
