import { prisma } from "../lib/prisma";
import { analyzeReceiptWithAIForMaintenance } from "../app/actions/receiptActions";

type Args = {
  companyId: number;
  run: boolean;
  limit?: number;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let companyId: number | undefined;
  let run = false;
  let limit: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--company") {
      companyId = Number(argv[++i]);
      continue;
    }

    if (arg === "--run") {
      run = true;
      continue;
    }

    if (arg === "--limit") {
      limit = Number(argv[++i]);
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(`\nNotkun:\n  npx tsx scripts/reanalyze-unreviewed.ts --company <ID>\n  GLOGGT_ALLOW_MAINTENANCE_REANALYZE=1 npx tsx scripts/reanalyze-unreviewed.ts --company <ID> --run\n\nValfrjálst:\n  --limit <N>   Takmarka fjölda skjala í prófun\n\nSjálfgefið er dry-run. --run framkvæmir endurlestur.\n`);
      process.exit(0);
    }

    throw new Error(`Óþekkt viðfang: ${arg}`);
  }

  if (companyId === undefined || !Number.isInteger(companyId) || companyId <= 0) {
    throw new Error("--company <ID> er nauðsynlegt og verður að vera jákvæð heiltala.");
  }

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit verður að vera jákvæð heiltala.");
  }

  return { companyId, run, limit };
}

async function main() {
  const { companyId, run, limit } = parseArgs();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true },
  });

  if (!company) {
    throw new Error(`Fyrirtæki #${companyId} fannst ekki.`);
  }

  // analyzeReceiptWithAI endurbyggir öll AiDetectedDocument fyrir Receipt.
  // Þess vegna veljum við aðeins receipts þar sem EKKERT undirskjal er
  // yfirfarið, bókað eða endanlega afgreitt.
  const candidates = await prisma.receipt.findMany({
    where: {
      companyId,
      voucherNumber: null,
      aiDetectedDocuments: {
        some: {
          reviewedAt: null,
          approvedAt: null,
          voucherNumber: null,
          disposedAt: null,
        },
        none: {
          OR: [
            { reviewedAt: { not: null } },
            { approvedAt: { not: null } },
            { voucherNumber: { not: null } },
            { disposedAt: { not: null } },
          ],
        },
      },
    },
    select: {
      id: true,
      description: true,
      merchantName: true,
      aiDate: true,
      date: true,
      amount: true,
      status: true,
      aiDetectedDocuments: {
        select: {
          id: true,
          merchantName: true,
          date: true,
          totalAmount: true,
          reviewedAt: true,
          approvedAt: true,
          voucherNumber: true,
          disposedAt: true,
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ aiDate: "asc" }, { date: "asc" }, { id: "asc" }],
    ...(limit ? { take: limit } : {}),
  });

  console.log(`\nGLÖGGT – endurlestur óunninna skjala`);
  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log(`Hamur: ${run ? "KEYRA" : "DRY-RUN"}`);
  console.log(`Fundin receipts: ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log("Engin óyfirfarin/óbókuð skjöl fundust sem uppfylla öryggisskilyrðin.");
    return;
  }

  candidates.forEach((receipt, index) => {
    const merchant =
      receipt.merchantName ??
      receipt.aiDetectedDocuments[0]?.merchantName ??
      receipt.description ??
      "Óþekkt";
    const date = receipt.aiDate ?? receipt.date ?? receipt.aiDetectedDocuments[0]?.date;
    const amount = receipt.aiDetectedDocuments[0]?.totalAmount ?? receipt.amount;

    console.log(
      `${String(index + 1).padStart(3, " ")}/${candidates.length}  receipt #${receipt.id}  ${date ? date.toISOString().slice(0, 10) : "óþekkt"}  ${merchant}  ${amount ?? "?"} kr.`
    );
  });

  if (!run) {
    console.log("\nDRY-RUN: Engu var breytt.");
    console.log("Ef listinn er réttur, keyrðu aftur með --run og maintenance-env breytunni.");
    return;
  }

  if (process.env.GLOGGT_ALLOW_MAINTENANCE_REANALYZE !== "1") {
    throw new Error(
      "--run krefst GLOGGT_ALLOW_MAINTENANCE_REANALYZE=1. Þetta kemur í veg fyrir óvart endurlestur."
    );
  }

  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ receiptId: number; error: string }> = [];

  console.log("\nEndurlestur hefst...\n");

  for (let i = 0; i < candidates.length; i += 1) {
    const receipt = candidates[i];
    const prefix = `[${i + 1}/${candidates.length}] receipt #${receipt.id}`;

    try {
      // Öryggisathugun aftur rétt áður en hvert receipt er unnið.
      // Ef notandi hefur yfirfarið/bókað skjalið síðan listinn var sóttur er því sleppt.
      const stillSafe = await prisma.receipt.findFirst({
        where: {
          id: receipt.id,
          companyId,
          voucherNumber: null,
          aiDetectedDocuments: {
            some: {
              reviewedAt: null,
              approvedAt: null,
              voucherNumber: null,
              disposedAt: null,
            },
            none: {
              OR: [
                { reviewedAt: { not: null } },
                { approvedAt: { not: null } },
                { voucherNumber: { not: null } },
                { disposedAt: { not: null } },
              ],
            },
          },
        },
        select: { id: true },
      });

      if (!stillSafe) {
        console.log(`${prefix}  SLEPPT – staða breyttist eftir dry-run/listun.`);
        continue;
      }

      await analyzeReceiptWithAIForMaintenance(receipt.id);
      succeeded += 1;
      console.log(`${prefix}  OK`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ receiptId: receipt.id, error: message });
      console.error(`${prefix}  VILLA – ${message}`);
    }
  }

  console.log("\nLokið.");
  console.log(`Tókst: ${succeeded}`);
  console.log(`Mistókst: ${failed}`);

  if (failures.length > 0) {
    console.log("\nVillur:");
    for (const failure of failures) {
      console.log(`- receipt #${failure.receiptId}: ${failure.error}`);
    }
  }
}

main()
  .catch((error) => {
    console.error("\nSTOPP:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
