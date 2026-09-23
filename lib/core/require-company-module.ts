import { redirect } from "next/navigation";
import type { GloggtModuleId } from "@/lib/core/modules";
import { isCompanyModuleEnabled } from "@/lib/core/company-modules";
import {
  getRequestAuthContext,
  getRequestCompanyModuleSettings,
  getRequestUserCompany,
} from "@/lib/core/request-context";

export async function requireCompanyModule(moduleId: GloggtModuleId) {
  const context = await getRequestAuthContext();
  const sessionUser = context.sessionUser;

  if (!sessionUser) {
    redirect("/innskraning");
  }

  const companyId = context.activeCompanyId;

  if (!companyId) {
    redirect("/fyrirtaeki");
  }

  // Varðveitir núverandi hegðun: raunverulega innskráður ADMIN fer fram hjá
  // UserCompany-prófi. Impersonation breytir því ekki þessari require-reglu.
  if (sessionUser.role !== "ADMIN") {
    const access = await getRequestUserCompany(sessionUser.id, companyId);

    if (!access?.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const settings = await getRequestCompanyModuleSettings(companyId);

  if (!isCompanyModuleEnabled(moduleId, settings)) {
    redirect("/");
  }

  return companyId;
}
