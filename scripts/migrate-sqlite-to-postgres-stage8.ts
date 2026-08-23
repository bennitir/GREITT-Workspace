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

async function main() {
  try {
    const sqliteCounts = {
      Account: sqlite.prepare(`SELECT COUNT(*) AS c FROM "Account"`).get() as { c: number },
      AiBookingEntry: sqlite.prepare(`SELECT COUNT(*) AS c FROM "AiBookingEntry"`).get() as { c: number },
      AiDetectedDocument: sqlite.prepare(`SELECT COUNT(*) AS c FROM "AiDetectedDocument"`).get() as { c: number },
      AiDetectedDocumentEntry: sqlite.prepare(`SELECT COUNT(*) AS c FROM "AiDetectedDocumentEntry"`).get() as { c: number },
      AiUsage: sqlite.prepare(`SELECT COUNT(*) AS c FROM "AiUsage"`).get() as { c: number },
      Company: sqlite.prepare(`SELECT COUNT(*) AS c FROM "Company"`).get() as { c: number },
      CompanyModule: sqlite.prepare(`SELECT COUNT(*) AS c FROM "CompanyModule"`).get() as { c: number },
      Customer: sqlite.prepare(`SELECT COUNT(*) AS c FROM "Customer"`).get() as { c: number },
      ImportBatch: sqlite.prepare(`SELECT COUNT(*) AS c FROM "ImportBatch"`).get() as { c: number },
      ImportRow: sqlite.prepare(`SELECT COUNT(*) AS c FROM "ImportRow"`).get() as { c: number },
      Receipt: sqlite.prepare(`SELECT COUNT(*) AS c FROM "Receipt"`).get() as { c: number },
      ReceiptEntry: sqlite.prepare(`SELECT COUNT(*) AS c FROM "ReceiptEntry"`).get() as { c: number },
      Session: sqlite.prepare(`SELECT COUNT(*) AS c FROM "Session"`).get() as { c: number },
      UsageEvent: sqlite.prepare(`SELECT COUNT(*) AS c FROM "UsageEvent"`).get() as { c: number },
      User: sqlite.prepare(`SELECT COUNT(*) AS c FROM "User"`).get() as { c: number },
      UserCompany: sqlite.prepare(`SELECT COUNT(*) AS c FROM "UserCompany"`).get() as { c: number },
      VoucherNumberReservation: sqlite.prepare(`SELECT COUNT(*) AS c FROM "VoucherNumberReservation"`).get() as { c: number },
    };

    const remoteCounts = {
      Account: await prisma.account.count(),
      AiBookingEntry: await prisma.aiBookingEntry.count(),
      AiDetectedDocument: await prisma.aiDetectedDocument.count(),
      AiDetectedDocumentEntry: await prisma.aiDetectedDocumentEntry.count(),
      AiUsage: await prisma.aiUsage.count(),
      Company: await prisma.company.count(),
      CompanyModule: await prisma.companyModule.count(),
      Customer: await prisma.customer.count(),
      ImportBatch: await prisma.importBatch.count(),
      ImportRow: await prisma.importRow.count(),
      Receipt: await prisma.receipt.count(),
      ReceiptEntry: await prisma.receiptEntry.count(),
      Session: await prisma.session.count(),
      UsageEvent: await prisma.usageEvent.count(),
      User: await prisma.user.count(),
      UserCompany: await prisma.userCompany.count(),
      VoucherNumberReservation: await prisma.voucherNumberReservation.count(),
    };

    console.log("\nLokaúttekt SQLite vs Supabase:\n");

    let allMatch = true;

    for (const key of Object.keys(sqliteCounts) as Array<keyof typeof sqliteCounts>) {
      const sqliteCount = sqliteCounts[key].c;
      const supabaseCount = remoteCounts[key];
      const ok = sqliteCount === supabaseCount;

      if (!ok) {
        allMatch = false;
      }

      console.log(
        `${ok ? "✅" : "❌"} ${key}: SQLite=${sqliteCount}, Supabase=${supabaseCount}`
      );
    }

    if (!allMatch) {
      throw new Error("STOPP: Ein eða fleiri töflur passa ekki.");
    }

    console.log("\n✅ ALLAR TÖFLUR PASSA.");
    console.log("✅ Lokaúttekt gagnagrunns tókst.");
    console.log("ℹ️ Engum gögnum var breytt.");
  } catch (error) {
    console.error("\n❌ Villa í lokaúttekt:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();