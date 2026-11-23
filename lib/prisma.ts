import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { assertSafeVercelPreviewEnvironment } from "./core/preview-environment";
import { prismaPgConnectionOptions } from "./core/verified-database-tls";

assertSafeVercelPreviewEnvironment();
const adapter = new PrismaPg(prismaPgConnectionOptions());

const globalForPrisma = globalThis as unknown as {
  prismaV11: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prismaV11 ??
  new PrismaClient({
    adapter,
  });

globalForPrisma.prismaV11 = prisma;