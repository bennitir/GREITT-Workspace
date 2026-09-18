import "server-only";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { normalizeUiLanguage } from "@/lib/i18n/ui";

export async function getCurrentInterfaceLanguage() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  if (!token) return "is" as const;

  const session = await prisma.session.findUnique({
    where: { token },
    select: { userId: true, expiresAt: true },
  });

  if (!session || session.expiresAt <= new Date()) return "is" as const;

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.userId },
    select: { interfaceLanguage: true },
  });

  return normalizeUiLanguage(settings?.interfaceLanguage);
}
