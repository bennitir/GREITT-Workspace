/** Read-only projection of existing, company-scoped Innsýn loan identities.
 * A confirmed relationship is evidence of association, NOT proof of a loan
 * balance, a contract amount or an actual parent/child debt.
 */
export type FamilyLoanEntity = {
  id: number;
  companyId: number;
  entityType: string;
  status: string;
  name: string;
  identifierType: string | null;
  identifierValue: string | null;
};
export type FamilyLoanRelation = {
  fromEntityId: number;
  toEntityId: number;
  relationType: string;
  status: string;
  fromEntity: FamilyLoanEntity;
  toEntity: FamilyLoanEntity;
};
export type FamilyLoanRegistryRow = {
  id: number;
  name: string;
  identifier: string | null;
  borrower: string | null;
  lender: string | null;
  vehicle: string | null;
  /** When multiple confirmed links exist, never pick the first and assert it. */
  needsReview: boolean;
  issues: string[];
  /** Never infer from bank transactions or metadata; requires a separate source. */
  confirmedOutstandingIsk: null;
};

const typeFor: Record<'borrower' | 'lender' | 'vehicle', readonly string[]> = {
  borrower: ['PERSON'],
  lender: ['PERSON', 'ORGANIZATION'],
  vehicle: ['VEHICLE'],
};
const relationFor: Record<'borrower' | 'lender' | 'vehicle', readonly string[]> = {
  borrower: ['BORROWER'],
  lender: ['LENDER'],
  vehicle: ['ASSOCIATED_WITH', 'FINANCES', 'SECURED_BY'],
};
const issueFor = { borrower: 'Lántaki óstaðfestur', lender: 'Lánveitandi óstaðfestur', vehicle: 'Ökutæki óstaðfest' };

export function projectFamilyLoanRegistry(input: {
  companyId: number;
  loans: FamilyLoanEntity[];
  relations: FamilyLoanRelation[];
}): FamilyLoanRegistryRow[] {
  if (!Number.isSafeInteger(input.companyId) || input.companyId <= 0) throw Error('FAMILY_LOAN_COMPANY_INVALID');
  const loans = input.loans.filter(l => l.companyId === input.companyId && l.entityType === 'LOAN' && l.status === 'ACTIVE');
  const loanIds = new Set(loans.map(l => l.id));
  const validRelations = input.relations.filter(r =>
    r.status === 'CONFIRMED' && r.fromEntity.companyId === input.companyId &&
    r.toEntity.companyId === input.companyId &&
    r.fromEntity.status === 'ACTIVE' && r.toEntity.status === 'ACTIVE' &&
    r.fromEntity.id === r.fromEntityId && r.toEntity.id === r.toEntityId &&
    (loanIds.has(r.fromEntityId) || loanIds.has(r.toEntityId)),
  );
  return loans.map(loan => {
    const issues: string[] = [];
    function association(kind: 'borrower' | 'lender' | 'vehicle'): string | null {
      const linked = new Map<number, FamilyLoanEntity>();
      for (const relation of validRelations) {
        if (!relationFor[kind].includes(relation.relationType)) continue;
        const person = relation.fromEntityId === loan.id ? relation.toEntity
          : relation.toEntityId === loan.id ? relation.fromEntity : null;
        if (person && person.id !== loan.id && typeFor[kind].includes(person.entityType)) linked.set(person.id, person);
      }
      if (kind === 'vehicle' && linked.size === 0) return null;
      if (linked.size !== 1) {
        issues.push(linked.size > 1 ? `Fleiri en einn ${kind === 'borrower' ? 'lántaki' : kind === 'lender' ? 'lánveitandi' : 'bíll'} tengdur` : issueFor[kind]);
        return null;
      }
      const linkedEntity = [...linked.values()][0];
      if (kind === 'vehicle' && !linkedEntity.identifierValue?.trim()) {
        issues.push('Skráningarnúmer ökutækis vantar');
        return null;
      }
      return kind === 'vehicle' ? `${linkedEntity.name} (${linkedEntity.identifierValue})` : linkedEntity.name;
    }
    const borrower = association('borrower');
    const lender = association('lender');
    const vehicle = association('vehicle');
    if (!loan.identifierValue?.trim()) issues.push('Lánsnúmer vantar');
    return {
      id: loan.id, name: loan.name, identifier: loan.identifierValue?.trim() || null,
      borrower, lender, vehicle, needsReview: issues.length > 0, issues,
      confirmedOutstandingIsk: null as null,
    };
  }).sort((a,b) => a.name.localeCompare(b.name, 'is') || a.id - b.id);
}
