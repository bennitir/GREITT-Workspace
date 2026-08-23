import "dotenv/config";

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

async function fixSequence(tableName: string, columnName = "id") {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    'SELECT MAX("' + columnName + '") AS max_id FROM "' + tableName + '"'
  );

  const maxId = rows[0]?.max_id;

  const sequenceRows = await prisma.$queryRawUnsafe<any[]>(
    "SELECT pg_get_serial_sequence('\"" +
      tableName +
      "\"', '" +
      columnName +
      "') AS sequence_name"
  );

  const sequenceName = sequenceRows[0]?.sequence_name;

  if (!sequenceName) {
    console.log(
      "ℹ️ " + tableName + ": engin PostgreSQL sequence fannst."
    );
    return;
  }

  if (maxId === null || maxId === undefined) {
    await prisma.$executeRawUnsafe(
      "SELECT setval('" + sequenceName + "', 1, false)"
    );

    console.log(
      "✅ " + tableName + ": tóm tafla, næsta ID verður 1."
    );
    return;
  }

  await prisma.$executeRawUnsafe(
    "SELECT setval('" + sequenceName + "', " + maxId + ", true)"
  );

  console.log(
    "✅ " +
      tableName +
      ": hæsta ID = " +
      maxId +
      ", næsta ID verður " +
      (Number(maxId) + 1)
  );
}

async function main() {
  try {
    const tables = [
      "Account",
      "AiBookingEntry",
      "AiDetectedDocument",
      "AiDetectedDocumentEntry",
      "AiUsage",
      "Company",
      "CompanyModule",
      "Customer",
      "ImportBatch",
      "ImportRow",
      "Receipt",
      "ReceiptEntry",
      "Session",
      "UsageEvent",
      "User",
      "UserCompany",
      "VoucherNumberReservation",
    ];

    console.log("Athuga PostgreSQL ID-raðir...");

    for (const table of tables) {
      await fixSequence(table);
    }

    console.log("");
    console.log("✅ PostgreSQL ID-raðir yfirfarnar og stilltar.");
  } catch (error) {
    console.error("");
    console.error("❌ Villa við stillingu ID-raða:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();