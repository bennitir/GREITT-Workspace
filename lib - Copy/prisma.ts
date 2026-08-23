import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({
  url: "file:./dev.db",
});

const globalForPrisma = globalThis as unknown as {
  prismaV11: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prismaV11 ??
  new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaV11= prisma;
}