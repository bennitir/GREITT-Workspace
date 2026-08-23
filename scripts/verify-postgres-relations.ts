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

async function main() {
  try {
    console.log("Byrja tengslaúttekt á Supabase...\n");

    const orphanReceipts = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(`
      SELECT COUNT(*)::bigint AS count
      FROM "Receipt" r
      LEFT JOIN "Company" c ON c.id = r."companyId"
      WHERE c.id IS NULL
    `);

    const orphanReceiptEntries = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(`
      SELECT COUNT(*)::bigint AS count
      FROM "ReceiptEntry" re
      LEFT JOIN "Receipt" r ON r.id = re."receiptId"
      WHERE r.id IS NULL
    `);

    const orphanDetectedDocuments = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(`
      SELECT COUNT(*)::bigint AS count
      FROM "AiDetectedDocument" d
      LEFT JOIN "Receipt" r ON r.id = d."receiptId"
      WHERE r.id IS NULL
    `);

    const orphanDetectedEntries = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(`
      SELECT COUNT(*)::bigint AS count
      FROM "AiDetectedDocumentEntry" e
      LEFT JOIN "AiDetectedDocument" d
        ON d.id = e."documentId"
      WHERE d.id IS NULL
    `);

    const orphanUserCompanies = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(`
      SELECT COUNT(*)::bigint AS count
      FROM "UserCompany" uc
      LEFT JOIN "User" u ON u.id = uc."userId"
      LEFT JOIN "Company" c ON c.id = uc."companyId"
      WHERE u.id IS NULL OR c.id IS NULL
    `);

    const orphanCompanyModules = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(`
      SELECT COUNT(*)::bigint AS count
      FROM "CompanyModule" cm
      LEFT JOIN "Company" c ON c.id = cm."companyId"
      WHERE c.id IS NULL
    `);

    const orphanVoucherReservations = await prisma.$queryRawUnsafe<
      { count: bigint }[]
    >(`
      SELECT COUNT(*)::bigint AS count
      FROM "VoucherNumberReservation" v
      LEFT JOIN "Company" c ON c.id = v."companyId"
      WHERE c.id IS NULL
    `);

    const checks = {
      ReceiptWithoutCompany:
        Number(orphanReceipts[0]?.count ?? 0),
      ReceiptEntryWithoutReceipt:
        Number(orphanReceiptEntries[0]?.count ?? 0),
      AiDetectedDocumentWithoutReceipt:
        Number(orphanDetectedDocuments[0]?.count ?? 0),
      AiDetectedDocumentEntryWithoutDocument:
        Number(orphanDetectedEntries[0]?.count ?? 0),
      UserCompanyBrokenRelation:
        Number(orphanUserCompanies[0]?.count ?? 0),
      CompanyModuleWithoutCompany:
        Number(orphanCompanyModules[0]?.count ?? 0),
      VoucherReservationWithoutCompany:
        Number(orphanVoucherReservations[0]?.count ?? 0),
    };

    console.log("Niðurstöður tengslaúttektar:");
    console.table(checks);

    const hasErrors = Object.values(checks).some(
      (count) => count !== 0
    );

    if (hasErrors) {
      throw new Error(
        "STOPP: Brotin tengsl fundust í Supabase."
      );
    }

    console.log("");
    console.log("✅ ÖLL TENGSL PASSA.");
    console.log(
      "✅ Engar munaðarlausar færslur fundust."
    );
    console.log("ℹ️ Engum gögnum var breytt.");
  } catch (error) {
    console.error("");
    console.error("❌ Villa í tengslaúttekt:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();