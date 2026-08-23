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
    const detectedDocuments = sqlite
      .prepare(
        `SELECT * FROM "AiDetectedDocument" ORDER BY id`
      )
      .all() as Record<string, any>[];

    const bookingEntries = sqlite
      .prepare(
        `SELECT * FROM "AiBookingEntry" ORDER BY id`
      )
      .all() as Record<string, any>[];

    console.log("SQLite lota 4:");
    console.log({
      AiDetectedDocument: detectedDocuments.length,
      AiBookingEntry: bookingEntries.length,
    });

    const beforeCounts = {
      AiDetectedDocument:
        await prisma.aiDetectedDocument.count(),
      AiBookingEntry:
        await prisma.aiBookingEntry.count(),
    };

    console.log("Supabase fyrir lotu 4:", beforeCounts);

    if (
      Object.values(beforeCounts).some(
        (count) => count !== 0
      )
    ) {
      throw new Error(
        "STOPP: Lotu-4 töflurnar í Supabase eru ekki tómar."
      );
    }

    await prisma.$transaction(
      async (tx) => {
        for (const row of detectedDocuments) {
          await tx.aiDetectedDocument.create({
            data: normalizeRow(row) as any,
          });
        }

        for (const row of bookingEntries) {
          await tx.aiBookingEntry.create({
            data: normalizeRow(row) as any,
          });
        }
      },
      {
        timeout: 60000,
      }
    );

    const afterCounts = {
      AiDetectedDocument:
        await prisma.aiDetectedDocument.count(),
      AiBookingEntry:
        await prisma.aiBookingEntry.count(),
    };

    console.log("Supabase eftir lotu 4:", afterCounts);

    if (
      afterCounts.AiDetectedDocument !==
        detectedDocuments.length ||
      afterCounts.AiBookingEntry !==
        bookingEntries.length
    ) {
      throw new Error(
        "Talning eftir lotu 4 passar ekki við SQLite."
      );
    }

    console.log("✅ Lota 4 flutt og staðfest.");
  } catch (error) {
    console.error("❌ Villa í lotu 4:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();