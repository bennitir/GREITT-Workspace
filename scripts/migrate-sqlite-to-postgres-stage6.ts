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

  for (const [key, value] of Object.entries(result)) {
    if (value === null || value === undefined) {
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
    const reservations = sqlite
      .prepare(
        `SELECT * FROM "VoucherNumberReservation" ORDER BY id`
      )
      .all() as Record<string, any>[];

    console.log("SQLite lota 6:");
    console.log({
      VoucherNumberReservation: reservations.length,
    });

    const beforeCount =
      await prisma.voucherNumberReservation.count();

    console.log("Supabase fyrir lotu 6:", {
      VoucherNumberReservation: beforeCount,
    });

    if (beforeCount !== 0) {
      throw new Error(
        "STOPP: VoucherNumberReservation í Supabase er ekki tóm."
      );
    }

    await prisma.$transaction(
      async (tx) => {
        for (const row of reservations) {
          await tx.voucherNumberReservation.create({
            data: normalizeRow(row) as any,
          });
        }
      },
      {
        timeout: 60000,
      }
    );

    const afterCount =
      await prisma.voucherNumberReservation.count();

    console.log("Supabase eftir lotu 6:", {
      VoucherNumberReservation: afterCount,
    });

    if (afterCount !== reservations.length) {
      throw new Error(
        `Talning VoucherNumberReservation passar ekki. SQLite=${reservations.length}, Supabase=${afterCount}`
      );
    }

    console.log("✅ Lota 6 flutt og staðfest.");
  } catch (error) {
    console.error("❌ Villa í lotu 6:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();