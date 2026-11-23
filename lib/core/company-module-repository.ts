import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { familyLoanJournalLocalEnabled } from "@/lib/personal-finance/family-loan-journal-policy";

import { prisma } from "@/lib/prisma";
import {
  GLOGGT_MODULE_LIST,
  type GloggtModuleId,
} from "@/lib/core/modules";

const GLOGGT_MODULE_IDS = GLOGGT_MODULE_LIST.map((module) => module.id);

export async function getCompanyModuleSettings(companyId: number) {
  const modules = await prisma.companyModule.findMany({
    where: {
      companyId,
      moduleId: { in: GLOGGT_MODULE_IDS },
    },
    select: {
      moduleId: true,
      enabled: true,
    },
  });

  return Object.fromEntries(
    modules.map((module) => [module.moduleId, module.enabled]),
  ) as Partial<Record<GloggtModuleId, boolean>>;
}

export async function setCompanyModuleEnabled(
  companyId: number,
  moduleId: GloggtModuleId,
  enabled: boolean,
) {
  if (!GLOGGT_MODULE_IDS.includes(moduleId)) throw new Error("Óþekkt eining.");
  if (moduleId === "fjolskylduvidauki") {
    // Family activation is development-only. A localhost app backed by
    // Supabase/Production must never enable personal data through this UI.
    const cookieStore = await cookies();
    const token = cookieStore.get("sessionToken")?.value;
    if (!token) throw new Error("Fjölskylduaðgangi hafnað.");
    const session = await prisma.session.findUnique({
      where: { token },
      select: { expiresAt: true, user: { select: { id: true, role: true, isActive: true } } },
    });
    if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
      throw new Error("Fjölskylduaðgangi hafnað.");
    }
    const impersonatedId = Number(cookieStore.get("activeUserId")?.value || 0);
    // Impersonation must never grant access to someone else's family data.
    if (session.user.role === "ADMIN" && (!impersonatedId || impersonatedId === session.user.id)) {
      // A real system administrator (not impersonating another user).
    } else {
      if (session.user.role === "ADMIN") throw new Error("Fjölskylduaðgangi hafnað í notendaprófun.");
      const membership = await prisma.userCompany.findUnique({
        where: { userId_companyId: { userId: session.user.id, companyId } },
        select: { isActive: true, accessRole: true },
      });
      if (!membership?.isActive || membership.accessRole !== "OWNER") {
        throw new Error("Aðeins eigandi má stjórna fjölskylduviðaukanum.");
      }
    }
    if (enabled && !familyLoanJournalLocalEnabled()) {
      throw new Error("Fjölskylduviðaukinn má aðeins virkja í staðfestum staðbundnum V03-prófunargrunni.");
    }
  }

  const result = await prisma.companyModule.upsert({
    where: {
      companyId_moduleId: {
        companyId,
        moduleId,
      },
    },
    update: {
      enabled,
    },
    create: {
      companyId,
      moduleId,
      enabled,
    },
  });

  revalidatePath("/stjornbord");
  revalidatePath("/stjornun");
  revalidatePath("/mobile");
  revalidatePath("/");
  return result;
}
