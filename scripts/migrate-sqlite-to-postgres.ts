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

console.log("✅ Gamli GLÖGGT gagnagrunnurinn opnaðist.");

const tables = sqlite
  .prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name != '_prisma_migrations'
    ORDER BY name
  `)
  .all() as { name: string }[];

console.log("Töflur sem fundust:");
console.table(tables);

console.log("\nFjöldi lína í hverri töflu:");

for (const { name } of tables) {
  const count = sqlite
    .prepare(`SELECT COUNT(*) AS count FROM "${name}"`)
    .get() as { count: number };

  console.log(`${name}: ${count.count}`);
}

/*
  SQLite og PostgreSQL geyma sumar gagnagerðir á mismunandi hátt.
  Hér breytum við þeim áður en Prisma skrifar í PostgreSQL.
*/
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

async function migrateBaseTables() {
  const companies = sqlite
    .prepare(`SELECT * FROM "Company" ORDER BY id`)
    .all() as Record<string, any>[];

  const users = sqlite
    .prepare(`SELECT * FROM "User" ORDER BY id`)
    .all() as Record<string, any>[];

  const customers = sqlite
    .prepare(`SELECT * FROM "Customer" ORDER BY id`)
    .all() as Record<string, any>[];

  const accounts = sqlite
    .prepare(`SELECT * FROM "Account" ORDER BY id`)
    .all() as Record<string, any>[];

  console.log("\nFlyt grunn-töflur...");

  await prisma.$transaction(
    async (tx) => {
      for (const row of companies) {
        await tx.company.create({
          data: normalizeRow(row) as any,
        });
      }

      for (const row of users) {
        await tx.user.create({
          data: normalizeRow(row) as any,
        });
      }

      for (const row of customers) {
        await tx.customer.create({
          data: normalizeRow(row) as any,
        });
      }

      for (const row of accounts) {
        await tx.account.create({
          data: normalizeRow(row) as any,
        });
      }
    },
    {
      timeout: 60000,
    }
  );

  console.log("✅ Grunn-töflur fluttar.");
}

async function main() {
  try {
    console.log(
      "\nAthuga Supabase áður en flutningur hefst..."
    );

    const remoteCounts = {
      Company: await prisma.company.count(),
      User: await prisma.user.count(),
      Customer: await prisma.customer.count(),
      Account: await prisma.account.count(),
    };

    console.log(
      "Supabase fyrir flutning:",
      remoteCounts
    );

    if (
      Object.values(remoteCounts).some(
        (count) => count !== 0
      )
    ) {
      throw new Error(
        "STOPP: Grunntöflur í Supabase eru ekki tómar."
      );
    }

    console.log(
      "✅ Grunntöflur Supabase eru tómar."
    );

    await migrateBaseTables();

    const afterCounts = {
      Company: await prisma.company.count(),
      User: await prisma.user.count(),
      Customer: await prisma.customer.count(),
      Account: await prisma.account.count(),
    };

    console.log(
      "\nSupabase eftir fyrsta flutning:"
    );
    console.log(afterCounts);

    console.log(
      "✅ Fyrsta flutningsskrefi lokið."
    );
  } catch (error) {
    console.error("\n❌ Villa í flutningi:");
    console.error(error);
    process.exitCode = 1;
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main();