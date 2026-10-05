import path from "node:path";
import { prisma } from "../lib/prisma";
import { supabaseAdmin } from "../lib/supabase";

const COMPANY_NAME = "Sturla Ólafsson";
const BUCKET = "fylgiskjol";

type StorageFile = {
  storagePath: string;
  size: number | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function looksLikeNovaJulAugFileName(storagePath: string) {
  const name = path.basename(storagePath);
  return /BR2607[-_]/i.test(name) || /BR2608[-_]/i.test(name);
}

function looksLikeNovaJulAugText(value: unknown) {
  const text = String(value ?? "").toLowerCase();
  return (
    (text.includes("nova") || text.includes("br2607") || text.includes("br2608")) &&
    (
      text.includes("br2607") ||
      text.includes("br2608") ||
      text.includes("2026-07") ||
      text.includes("2026-08") ||
      text.includes("júlí 2026") ||
      text.includes("ágúst 2026")
    )
  );
}

async function listStorageFilesRecursively(prefix: string): Promise<StorageFile[]> {
  const files: StorageFile[] = [];
  const queue = [prefix];

  while (queue.length) {
    const current = queue.shift()!;
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(current, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) throw new Error(`STORAGE_LIST_FAILED:${current}:${error.message}`);

      const rows = data ?? [];
      for (const item of rows) {
        const itemPath = current ? `${current}/${item.name}` : item.name;
        const isFolder = item.id == null && item.metadata == null;

        if (isFolder) {
          queue.push(itemPath);
          continue;
        }

        files.push({
          storagePath: itemPath,
          size:
            item.metadata && typeof item.metadata === "object" && "size" in item.metadata
              ? Number((item.metadata as { size?: unknown }).size ?? 0) || null
              : null,
          createdAt: item.created_at ?? null,
          updatedAt: item.updated_at ?? null,
        });
      }

      if (rows.length < 100) break;
      offset += rows.length;
    }
  }

  return files;
}

async function main() {
  console.log("=== NOVA JÚLÍ–ÁGÚST 2026 — ORPHAN CHECK V2 ===");
  console.log("READ-ONLY: engar breytingar á DB eða Storage.\n");

  const companies = await prisma.company.findMany({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });

  if (companies.length !== 1) {
    throw new Error(`EXPECTED_ONE_COMPANY_FOUND_${companies.length}`);
  }

  const company = companies[0];
  console.log(`Fyrirtæki: ${company.name} (#${company.id})\n`);

  const dbReceipts = await prisma.receipt.findMany({
    where: { companyId: company.id },
    select: {
      id: true,
      storagePath: true,
      fileName: true,
      merchantName: true,
      date: true,
      aiDate: true,
      status: true,
      aiDetectedDocuments: {
        select: {
          id: true,
          merchantName: true,
          date: true,
          receiptNumber: true,
          approvedAt: true,
          voucherNumber: true,
          disposition: true,
          disposedAt: true,
        },
      },
    },
  });

  const exactNovaDb = dbReceipts.flatMap((receipt) =>
    receipt.aiDetectedDocuments
      .filter((doc) => {
        const d = doc.date?.toISOString().slice(0, 7);
        return (
          (doc.merchantName ?? "").toLowerCase().includes("nova") &&
          (d === "2026-07" || d === "2026-08")
        ) ||
        /^BR260[78]-/i.test(doc.receiptNumber ?? "");
      })
      .map((doc) => ({
        receiptId: receipt.id,
        fileName: receipt.fileName,
        storagePath: receipt.storagePath,
        receiptStatus: receipt.status,
        document: {
          id: doc.id,
          merchantName: doc.merchantName,
          date: doc.date?.toISOString().slice(0, 10) ?? null,
          receiptNumber: doc.receiptNumber,
          approvedAt: doc.approvedAt?.toISOString() ?? null,
          voucherNumber: doc.voucherNumber,
          disposition: doc.disposition,
          disposedAt: doc.disposedAt?.toISOString() ?? null,
        },
      })),
  );

  console.log("1) Nákvæm Nova júlí/ágúst færsla í DB");
  if (exactNovaDb.length === 0) {
    console.log("   ENGIN.");
  } else {
    exactNovaDb.forEach((row) => console.log(JSON.stringify(row, null, 2)));
  }

  const dbPaths = new Set(
    dbReceipts
      .map((r) => r.storagePath)
      .filter((v): v is string => Boolean(v)),
  );

  const storageFiles = await listStorageFilesRecursively(String(company.id));
  const orphans = storageFiles
    .filter((file) => !dbPaths.has(file.storagePath))
    .sort((a, b) => a.storagePath.localeCompare(b.storagePath));

  console.log(`\n2) Allar munaðarlausar Storage-skrár (${orphans.length})`);
  if (orphans.length === 0) {
    console.log("   Engar.");
  } else {
    orphans.forEach((file, index) => {
      console.log(
        `${String(index + 1).padStart(2, "0")}. ${file.storagePath}` +
        ` | size=${file.size ?? "?"}` +
        ` | created=${file.createdAt ?? "?"}` +
        ` | updated=${file.updatedAt ?? "?"}`,
      );
    });
  }

  const filenameCandidates = orphans.filter((file) =>
    looksLikeNovaJulAugFileName(file.storagePath),
  );

  console.log("\n3) Sterkir Nova júlí/ágúst candidates út frá skráarnafni (BR2607 / BR2608)");
  if (filenameCandidates.length === 0) {
    console.log("   ENGINN.");
  } else {
    filenameCandidates.forEach((file) => console.log(JSON.stringify(file, null, 2)));
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      companyId: company.id,
      createdAt: { gte: new Date("2026-01-01T00:00:00.000Z") },
    },
    select: {
      id: true,
      action: true,
      source: true,
      description: true,
      metadata: true,
      beforeData: true,
      afterData: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const auditMatches = auditEvents.filter((event) =>
    looksLikeNovaJulAugText(
      JSON.stringify({
        action: event.action,
        description: event.description,
        metadata: event.metadata,
        beforeData: event.beforeData,
        afterData: event.afterData,
      }),
    ),
  );

  console.log("\n4) Audit sem nefnir Nova / BR2607 / BR2608 / júlí-ágúst 2026");
  if (auditMatches.length === 0) {
    console.log("   ENGINN.");
  } else {
    auditMatches.forEach((event) => {
      console.log(
        JSON.stringify(
          {
            id: event.id,
            action: event.action,
            source: event.source,
            createdAt: event.createdAt.toISOString(),
            userId: event.userId,
            userName: event.user?.name ?? null,
            userEmail: event.user?.email ?? null,
            description: event.description,
            metadata: event.metadata,
            beforeData: event.beforeData,
            afterData: event.afterData,
          },
          null,
          2,
        ),
      );
    });
  }

  console.log("\n=== TÚLKUN ===");
  if (exactNovaDb.length === 0) {
    console.log("- Engin Nova-færsla dagsett í júlí eða ágúst 2026 er nú í DB.");
  } else {
    console.log("- Nova júlí/ágúst er í DB; skoða stöðu færslnanna hér að ofan.");
  }

  if (filenameCandidates.length > 0) {
    console.log(
      "- BR2607/BR2608 fannst í Storage án Receipt.storagePath: sterk vísbending um að upload hafi verið til en DB-færslan horfið/hafi verið eytt.",
    );
  } else {
    console.log(
      "- Engin BR2607/BR2608 orphan fannst út frá Nova skráarnafnamynstrinu.",
    );
  }

  if (auditMatches.length === 0) {
    console.log(
      "- Engin varðveitt audit-færsla segir hver hafi afgreitt/eytt Nova júlí/ágúst.",
    );
  }
}

main()
  .catch((error) => {
    console.error("DIAGNOSTIC_FAILED");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
