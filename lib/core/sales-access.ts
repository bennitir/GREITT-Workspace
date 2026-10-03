import "server-only";

import { getCompanyAccess } from "@/lib/core/access-control";
import { isCompanyModuleEnabled } from "@/lib/core/company-modules";
import {
  getRequestAuthContext,
  getRequestCompanyModuleSettings,
} from "@/lib/core/request-context";
import {
  hasSalesPermission,
  type SalesPermission,
  type SalesPermissionAccess,
} from "@/lib/core/sales-permissions";

export function assertSalesPermission(
  access: SalesPermissionAccess,
  permission: SalesPermission,
): void {
  if (!hasSalesPermission(access, permission)) {
    throw new Error(`SALES_PERMISSION_REQUIRED:${permission}`);
  }
}

export async function requireActiveSalesPermissions(
  permissions: readonly SalesPermission[],
) {
  const context = await getRequestAuthContext();

  if (!context.effectiveUser) {
    throw new Error("SALES_AUTH_REQUIRED");
  }

  const companyId = context.activeCompanyId;
  if (!companyId) {
    throw new Error("ACTIVE_COMPANY_REQUIRED");
  }

  const [access, moduleSettings] = await Promise.all([
    getCompanyAccess(companyId),
    getRequestCompanyModuleSettings(companyId),
  ]);

  if (!access.allowed) {
    throw new Error("SALES_COMPANY_ACCESS_DENIED");
  }

  if (!isCompanyModuleEnabled("sala", moduleSettings)) {
    throw new Error("SALES_MODULE_NOT_ENABLED");
  }

  for (const permission of new Set(permissions)) {
    assertSalesPermission(access, permission);
  }

  return { companyId, access };
}
