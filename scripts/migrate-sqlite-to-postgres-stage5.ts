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
    "vatRequiresConfirmation",
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
    const detectedDocumentEntries = sqlite
      .prepare(
        `SELECT * FROM "AiDetectedDocumentEntry" ORDER BY id`
      )
      .all() as Record<string, any>[];

    const receiptEntries = sqlite
      .prepare(
        `SELECT * FROM "ReceiptEntry" ORDER BY id`
      )
      .all() as Record<string, any>[];

    console.log("SQLite lota 5:");
    console.log({
      AiDetectedDocumentEntry:
        detectedDocumentEntries.length,
      ReceiptEntry: receiptEntries.length,
    });

    const beforeCounts = {
      AiDetectedDocumentEntry:
        await prisma.aiDetectedDocumentEntry.count(),
      ReceiptEntry:
        await prisma.receiptEntry.count(),
    };

    console.log("Supabase fyrir lotu 5:", beforeCounts);

    if (
      Object.values(beforeCounts).some(
        (count) => count !== 0
      )
    ) {
      throw new Error(
        "STOPP: Lotu-5 töflurnar í Supabase eru ekki tómar."
      );
    }

    await prisma.$transaction(
      async (tx) => {
        for (const row of detectedDocumentEntries) {
          await tx.aiDetectedDocumentEntry.create({
            data: normalizeRow(row) as any,
          });
        }

        for (const row of receiptEntries) {
          await tx.receiptEntry.create({
            data: normalizeRow(row) as any,
          });
        }
      },
      {
        timeout: 60000,
      }
    );

    const afterCounts = {
      AiDetectedDocumentEntry:
        await prisma.aiDetectedDocumentEntry.count(),
      ReceiptEntry:
        await prisma.receiptEntry.count(),
    };

    console.log("Supabase eftir lotu 5:", afterCounts);

    if (
      afterCounts.AiDetectedDocumentEntry !==
        detectedDocumentEntries.length ||
      afterCounts.ReceiptEntry !== receiptEntries.length
    ) {
      throw new Error(
        "Talning eftir lotu 5 passar ekki við SQLite."
      );
    }

    console.log("✅ Lota 5 flutt og staðfest.");
  } catch (error) {
    console.error("❌ Villa í lotu 5:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();