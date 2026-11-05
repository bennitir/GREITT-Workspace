import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getCompanyAccess } from "./access-control";

/** V03 read guard: a cookie selects the company; membership authorizes it.
 * Await before business queries. Mutation capabilities remain separate.
 */
export async function requireActiveCompanyReadAccess() {
  const store = await cookies();
  const companyId = Number(store.get("activeCompanyId")?.value);
  if (!Number.isSafeInteger(companyId) || companyId <= 0) notFound();
  const access = await getCompanyAccess(companyId);
  if (access.allowed !== true) notFound();
  return { companyId, access };
}
