import "dotenv/config";

import Database from "better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL vantar í .env");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

const sqlite = new Database("dev.db", {
  readonly: true,
});

function normalizeRow(
  row: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = { ...row };

  const booleanFields = new Set([
    "isActive",
    "enabled",
    "success",
  ]);

  for (const [key, value] of Object.entries(result)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (booleanFields.has(key)) {
      result[key] = Boolean(value);
      continue;
    }

    if (key.endsWith("At")) {
      if (value instanceof Date) {
        continue;
      }

      if (
        typeof value === "string" ||
        typeof value === "number"
      ) {
        const date = new Date(value);

        if (!Number.isNaN(date.getTime())) {
          result[key] = date;
        }
      }
    }
  }

  return result;
}

async function main() {
  try {
    const importBatches = sqlite
      .prepare(`SELECT * FROM "ImportBatch" ORDER BY id`)
      .all() as Record<string, any>[];

    const importRows = sqlite
      .prepare(`SELECT * FROM "ImportRow" ORDER BY id`)
      .all() as Record<string, any>[];

    const aiUsage = sqlite
      .prepare(`SELECT * FROM "AiUsage" ORDER BY id`)
      .all() as Record<string, any>[];

    const usageEvents = sqlite
      .prepare(`SELECT * FROM "UsageEvent" ORDER BY id`)
      .all() as Record<string, any>[];

    const sessions = sqlite
      .prepare(`SELECT * FROM "Session" ORDER BY id`)
      .all() as Record<string, any>[];

    console.log("SQLite lota 7:");
    console.log({
      ImportBatch: importBatches.length,
      ImportRow: importRows.length,
      AiUsage: aiUsage.length,
      UsageEvent: usageEvents.length,
      Session: sessions.length,
    });

    const beforeCounts = {
      ImportBatch: await prisma.importBatch.count(),
      ImportRow: await prisma.importRow.count(),
      AiUsage: await prisma.aiUsage.count(),
      UsageEvent: await prisma.usageEvent.count(),
      Session: await prisma.session.count(),
    };

    console.log("Supabase fyrir lotu 7:", beforeCounts);

    if (
      Object.values(beforeCounts).some(
        (count) => count !== 0
      )
    ) {
      throw new Error(
        "STOPP: Lotu-7 töflurnar í Supabase eru ekki tómar."
      );
    }

    await prisma.$transaction(
      async (tx) => {
        // ImportBatch fyrst því ImportRow getur vísað í hana.
        for (const row of importBatches) {
          await tx.importBatch.create({
            data: normalizeRow(row) as any,
          });
        }

        for (const row of importRows) {
          await tx.importRow.create({
            data: normalizeRow(row) as any,
          });
        }

        for (const row of aiUsage) {
          await tx.aiUsage.create({
            data: normalizeRow(row) as any,
          });
        }

        for (const row of usageEvents) {
          await tx.usageEvent.create({
            data: normalizeRow(row) as any,
          });
        }

        for (const row of sessions) {
          await tx.session.create({
            data: normalizeRow(row) as any,
          });
        }
      },
      {
        timeout: 60000,
      }
    );

    const afterCounts = {
      ImportBatch: await prisma.importBatch.count(),
      ImportRow: await prisma.importRow.count(),
      AiUsage: await prisma.aiUsage.count(),
      UsageEvent: await prisma.usageEvent.count(),
      Session: await prisma.session.count(),
    };

    console.log("Supabase eftir lotu 7:", afterCounts);

    if (
      afterCounts.ImportBatch !== importBatches.length ||
      afterCounts.ImportRow !== importRows.length ||
      afterCounts.AiUsage !== aiUsage.length ||
      afterCounts.UsageEvent !== usageEvents.length ||
      afterCounts.Session !== sessions.length
    ) {
      throw new Error(
        "Talning eftir lotu 7 passar ekki við SQLite."
      );
    }

    console.log("✅ Lota 7 flutt og staðfest.");
  } catch (error) {
    console.error("❌ Villa í lotu 7:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();