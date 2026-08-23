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
    const companyModules = sqlite
      .prepare(`SELECT * FROM "CompanyModule" ORDER BY id`)
      .all() as Record<string, any>[];

    const userCompanies = sqlite
      .prepare(`SELECT * FROM "UserCompany" ORDER BY id`)
      .all() as Record<string, any>[];

    console.log("SQLite lota 2:");
    console.log({
      CompanyModule: companyModules.length,
      UserCompany: userCompanies.length,
    });

    const beforeCounts = {
      CompanyModule: await prisma.companyModule.count(),
      UserCompany: await prisma.userCompany.count(),
    };

    console.log("Supabase fyrir lotu 2:", beforeCounts);

    if (
      Object.values(beforeCounts).some(
        (count) => count !== 0
      )
    ) {
      throw new Error(
        "STOPP: Lotu-2 töflurnar í Supabase eru ekki tómar."
      );
    }

    await prisma.$transaction(
      async (tx) => {
        for (const row of companyModules) {
          await tx.companyModule.create({
            data: normalizeRow(row) as any,
          });
        }

        for (const row of userCompanies) {
          await tx.userCompany.create({
            data: normalizeRow(row) as any,
          });
        }
      },
      {
        timeout: 60000,
      }
    );

    const afterCounts = {
      CompanyModule: await prisma.companyModule.count(),
      UserCompany: await prisma.userCompany.count(),
    };

    console.log("Supabase eftir lotu 2:", afterCounts);

    if (
      afterCounts.CompanyModule !== companyModules.length ||
      afterCounts.UserCompany !== userCompanies.length
    ) {
      throw new Error(
        "Talning eftir lotu 2 passar ekki við SQLite."
      );
    }

    console.log("✅ Lota 2 flutt og staðfest.");
  } catch (error) {
    console.error("❌ Villa í lotu 2:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();