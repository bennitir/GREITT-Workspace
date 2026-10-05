import { prisma } from "../lib/prisma";

const COMPANY_NAME = "Sturla Ólafsson";
const CARD_NAME = "Platinum";
const SOURCE_TYPE = "PAYMENT_CARD_STATEMENT_XLSX";

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function isoTime(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function amount(value: unknown) {
  return Number(value ?? 0);
}

async function main() {
  console.log("=== PLATINUM KORTAINNFLUTNINGUR — READ-ONLY PROVENANCE CHECK ===");
  console.log("Engar breytingar eru gerðar á gagnagrunni.\n");

  const companies = await prisma.company.findMany({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });

  if (companies.length !== 1) {
    throw new Error(`EXPECTED_ONE_COMPANY_FOUND_${companies.length}`);
  }

  const company = companies[0];

  const cards = await prisma.paymentCard.findMany({
    where: {
      companyId: company.id,
      name: { contains: CARD_NAME, mode: "insensitive" },
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      issuerName: true,
      network: true,
      lastFour: true,
    },
    orderBy: { id: "asc" },
  });

  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log("Kort sem passa við Platinum:");
  console.log(cards);

  if (cards.length !== 1) {
    console.log(
      "\nSTOPP: rannsóknin velur ekki sjálfkrafa kort ef fleiri eða færri en eitt virkt Platinum-kort finnst.",
    );
    return;
  }

  const card = cards[0];
  console.log(`\nValið kort: ${card.name} (#${card.id})`);

  const batches = await prisma.importBatch.findMany({
    where: {
      companyId: company.id,
      paymentCardId: card.id,
      sourceType: SOURCE_TYPE,
    },
    select: {
      id: true,
      fileName: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { rows: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("\n1) Allir kortainnflutningsbunkar fyrir Platinum");
  if (!batches.length) {
    console.log("   Engir bunkar fundust.");
  } else {
    for (const batch of batches) {
      console.log(
        JSON.stringify(
          {
            batchId: batch.id,
            fileName: batch.fileName,
            status: batch.status,
            rows: batch._count.rows,
            createdAt: isoTime(batch.createdAt),
            updatedAt: isoTime(batch.updatedAt),
          },
          null,
          2,
        ),
      );
    }
  }

  const transactions = await prisma.paymentCardTransaction.findMany({
    where: {
      paymentCardId: card.id,
      date: {
        gte: new Date("2026-06-01T00:00:00.000Z"),
        lt: new Date("2026-07-11T00:00:00.000Z"),
      },
    },
    select: {
      id: true,
      date: true,
      merchantText: true,
      merchantCategory: true,
      amount: true,
      cardPeriod: true,
      fingerprint: true,
      sourceType: true,
      sourceFileName: true,
      createdAt: true,
      status: true,
    },
    orderBy: [{ date: "desc" }, { id: "asc" }],
  });

  console.log(
    `\n2) Núverandi PaymentCardTransaction 01.06–10.07.2026: ${transactions.length}`,
  );

  const groups = new Map<
    string,
    {
      count: number;
      firstTransactionDate: Date;
      lastTransactionDate: Date;
      firstCreatedAt: Date;
      lastCreatedAt: Date;
      periods: Set<string>;
    }
  >();

  for (const tx of transactions) {
    const key = tx.sourceFileName ?? "(engin sourceFileName)";
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        count: 1,
        firstTransactionDate: tx.date,
        lastTransactionDate: tx.date,
        firstCreatedAt: tx.createdAt,
        lastCreatedAt: tx.createdAt,
        periods: new Set(tx.cardPeriod ? [tx.cardPeriod] : []),
      });
      continue;
    }

    current.count += 1;
    if (tx.date < current.firstTransactionDate) current.firstTransactionDate = tx.date;
    if (tx.date > current.lastTransactionDate) current.lastTransactionDate = tx.date;
    if (tx.createdAt < current.firstCreatedAt) current.firstCreatedAt = tx.createdAt;
    if (tx.createdAt > current.lastCreatedAt) current.lastCreatedAt = tx.createdAt;
    if (tx.cardPeriod) current.periods.add(tx.cardPeriod);
  }

  console.log("\n3) Hvaða eldri skrár stofnuðu þessar færslur?");
  for (const [sourceFileName, group] of [...groups.entries()].sort()) {
    console.log(
      JSON.stringify(
        {
          sourceFileName,
          transactionCount: group.count,
          transactionDateRange: [
            isoDate(group.firstTransactionDate),
            isoDate(group.lastTransactionDate),
          ],
          storedCardPeriods: [...group.periods].sort(),
          createdAtRange: [
            isoTime(group.firstCreatedAt),
            isoTime(group.lastCreatedAt),
          ],
        },
        null,
        2,
      ),
    );
  }

  const periodGroups = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const key = tx.cardPeriod ?? "(ekkert tímabil)";
    periodGroups.set(key, [...(periodGroups.get(key) ?? []), tx]);
  }

  console.log("\n4) Færslur flokkaðar eftir Korta tímabili");
  for (const [period, rows] of [...periodGroups.entries()].sort()) {
    const sources = [...new Set(rows.map((row) => row.sourceFileName ?? "(engin)"))].sort();
    console.log(
      JSON.stringify(
        {
          cardPeriod: period,
          count: rows.length,
          transactionDateRange: [
            isoDate(rows.reduce((a, b) => (a.date < b.date ? a : b)).date),
            isoDate(rows.reduce((a, b) => (a.date > b.date ? a : b)).date),
          ],
          sourceFiles: sources,
        },
        null,
        2,
      ),
    );
  }

  const samples = [
    { date: "2026-07-08", merchant: "Almar Bakari", absAmount: 1220 },
    { date: "2026-07-08", merchant: "Apotekarinn Selfossi", absAmount: 7491 },
    { date: "2026-07-08", merchant: "KRONAN SELFOSS", absAmount: 6054 },
    { date: "2026-07-08", merchant: "OB FJARDARKAUP", absAmount: 8867 },
    { date: "2026-07-06", merchant: "OLIS HELLA", absAmount: 16065 },
    { date: "2026-07-03", merchant: "ELKO LINDUM", absAmount: 139995 },
  ];

  console.log("\n5) Dæmi úr nýju forskoðuninni og nákvæm fyrri DB-færsla");
  for (const sample of samples) {
    const matches = transactions.filter(
      (tx) =>
        isoDate(tx.date) === sample.date &&
        tx.merchantText.toLocaleLowerCase("is-IS") ===
          sample.merchant.toLocaleLowerCase("is-IS") &&
        Math.abs(amount(tx.amount)) === sample.absAmount,
    );

    console.log(
      JSON.stringify(
        {
          previewRow: sample,
          dbMatches: matches.map((tx) => ({
            transactionId: tx.id,
            date: isoDate(tx.date),
            merchantText: tx.merchantText,
            amount: amount(tx.amount),
            cardPeriod: tx.cardPeriod,
            sourceFileName: tx.sourceFileName,
            sourceType: tx.sourceType,
            createdAt: isoTime(tx.createdAt),
            status: tx.status,
            fingerprint: tx.fingerprint,
          })),
        },
        null,
        2,
      ),
    );
  }

  const julyPeriod = await prisma.paymentCardTransaction.findMany({
    where: {
      paymentCardId: card.id,
      cardPeriod: "202607",
    },
    select: {
      id: true,
      date: true,
      merchantText: true,
      amount: true,
      sourceFileName: true,
      createdAt: true,
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  console.log("\n6) Sérstaklega: hvað er þegar geymt sem cardPeriod=202607?");
  console.log(`   Fjöldi: ${julyPeriod.length}`);
  if (julyPeriod.length) {
    const sourceCounts = new Map<string, number>();
    for (const row of julyPeriod) {
      const key = row.sourceFileName ?? "(engin)";
      sourceCounts.set(key, (sourceCounts.get(key) ?? 0) + 1);
    }

    console.log("   Upprunaskrár:");
    for (const [file, count] of [...sourceCounts.entries()].sort()) {
      console.log(`   - ${file}: ${count} færslur`);
    }

    console.log(
      `   Færsludagsetningar: ${isoDate(julyPeriod[0].date)} → ${isoDate(
        julyPeriod[julyPeriod.length - 1].date,
      )}`,
    );
    console.log(
      `   Elsta createdAt: ${isoTime(
        julyPeriod.reduce((a, b) => (a.createdAt < b.createdAt ? a : b)).createdAt,
      )}`,
    );
  }

  console.log("\n=== HVERNIG Á AÐ LESA NIÐURSTÖÐUNA ===");
  console.log(
    "- Ef 202607-færslurnar hafa sourceFileName úr eldri skrá og createdAt fyrir þessa nýju forskoðun, þá voru þær raunverulega fluttar inn áður.",
  );
  console.log(
    "- Ef samsvarandi ImportBatch er IMPORTED sést þar hvenær og úr hvaða skrá innflutningurinn varð.",
  );
  console.log(
    "- Ef sourceFileName / createdAt passa ekki við þekkta eldri innflutninga, þá þurfum við að rannsaka fingerprint/innflutningsferlið nánar.",
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
