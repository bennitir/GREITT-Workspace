import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { assertSafeVercelPreviewEnvironment } from "./core/preview-environment";
import { prismaPgConnectionOptions } from "./core/verified-database-tls";

const globalForPrisma = globalThis as unknown as {
  prismaV11: PrismaClient | undefined;
};

/**
 * Next.js imports server modules while collecting route metadata during builds.
 * Importing prisma must not require a live Preview database connection.
 * Every actual Prisma property access still validates the current environment
 * BEFORE the adapter or cached client can be used.
 */
function verifiedClient(): PrismaClient {
  assertSafeVercelPreviewEnvironment();

  if (!globalForPrisma.prismaV11) {
    const adapter = new PrismaPg(prismaPgConnectionOptions());
    globalForPrisma.prismaV11 = new PrismaClient({ adapter });
  }

  return globalForPrisma.prismaV11;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_unused, property) {
    const client = verifiedClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
