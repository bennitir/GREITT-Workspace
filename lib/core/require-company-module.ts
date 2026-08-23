import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { GloggtModuleId } from "@/lib/core/modules";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { isCompanyModuleEnabled } from "@/lib/core/company-modules";
import { prisma } from "@/lib/prisma";

export async function requireCompanyModule(moduleId: GloggtModuleId) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

const session = sessionToken
  ? await prisma.session.findUnique({
      where: {
        token: sessionToken,
      },
      include: {
        user: true,
      },
    })
  : null;

if (!session || session.expiresAt < new Date() || !session.user.isActive) {
  redirect("/innskraning");
}
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);
  if (session.user.role !== "ADMIN") {
  const access = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: {
        userId: session.user.id,
        companyId,
      },
    },
  });

  if (!access || !access.isActive) {
    redirect("/fyrirtaeki");
  }
}
  const settings = await getCompanyModuleSettings(companyId);

  if (!isCompanyModuleEnabled(moduleId, settings)) {
    redirect("/");
  }

  return companyId;
}
