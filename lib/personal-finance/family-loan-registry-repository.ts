import 'server-only';
import { prisma } from '@/lib/prisma';
import { projectFamilyLoanRegistry, type FamilyLoanRegistryRow } from './family-loan-registry';

/** The caller has already checked active company, user permission and opt-in.
 * Both queries are confined to the same company. This function performs no writes.
 */
export async function getFamilyLoanRegistry(companyId: number): Promise<{ loans: FamilyLoanRegistryRow[]; truncated: boolean }> {
  if (!Number.isSafeInteger(companyId) || companyId <= 0) throw Error('FAMILY_LOAN_COMPANY_INVALID');
  const entities = await prisma.insightEntity.findMany({
    where: { companyId, entityType: 'LOAN', status: 'ACTIVE' },
    select: { id: true, companyId: true, entityType: true, status: true, name: true, identifierType: true, identifierValue: true },
    orderBy: { id: 'asc' }, take: 501,
  });
  const truncated = entities.length > 500;
  const loans = entities.slice(0, 500);
  if (!loans.length) return { loans: [], truncated };
  const ids = loans.map(row => row.id);
  const relations = await prisma.insightEntityRelation.findMany({
    where: {
      status: 'CONFIRMED',
      relationType: { in: ['BORROWER', 'LENDER', 'ASSOCIATED_WITH', 'FINANCES', 'SECURED_BY'] },
      OR: [{ fromEntityId: { in: ids } }, { toEntityId: { in: ids } }],
      fromEntity: { companyId, status: 'ACTIVE' }, toEntity: { companyId, status: 'ACTIVE' },
    },
    select: {
      fromEntityId: true, toEntityId: true, relationType: true, status: true,
      fromEntity: { select: { id: true, companyId: true, entityType: true, status: true, name: true, identifierType: true, identifierValue: true } },
      toEntity: { select: { id: true, companyId: true, entityType: true, status: true, name: true, identifierType: true, identifierValue: true } },
    },
  });
  return { loans: projectFamilyLoanRegistry({ companyId, loans, relations }), truncated };
}
