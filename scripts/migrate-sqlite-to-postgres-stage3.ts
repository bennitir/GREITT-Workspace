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
    "vatRequiresConfirmation",
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
    const receipts = sqlite
      .prepare(`SELECT * FROM "Receipt" ORDER BY id`)
      .all() as Record<string, any>[];

    console.log("SQLite lota 3:");
    console.log({
      Receipt: receipts.length,
    });

    const beforeCount = await prisma.receipt.count();

    console.log("Supabase fyrir lotu 3:", {
      Receipt: beforeCount,
    });

    if (beforeCount !== 0) {
      throw new Error(
        "STOPP: Receipt-taflan í Supabase er ekki tóm."
      );
    }

    await prisma.$transaction(
      async (tx) => {
        for (const row of receipts) {
          await tx.receipt.create({
            data: normalizeRow(row) as any,
          });
        }
      },
      {
        timeout: 60000,
      }
    );

    const afterCount = await prisma.receipt.count();

    console.log("Supabase eftir lotu 3:", {
      Receipt: afterCount,
    });

    if (afterCount !== receipts.length) {
      throw new Error(
        `Talning Receipt passar ekki. SQLite=${receipts.length}, Supabase=${afterCount}`
      );
    }

    console.log("✅ Lota 3 flutt og staðfest.");
  } catch (error) {
    console.error("❌ Villa í lotu 3:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();