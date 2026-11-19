/**
 * GLÖGGT — one deterministic settlement equation for any company/person/vehicle.
 * READ ONLY. Bank hints, invoice payments and insurance transfers are NOT debt.
 * This module never reads/writes SQL, creates AuditEvents or charges interest.
 * Legacy ledger adapters may call balanceEffect without changing their storage.
 */
export type SettlementKind =
  'COST' | 'ADVANCE' | 'REPAYMENT' | 'WAIVER' |
  'CORRECTION_INCREASE' | 'CORRECTION_DECREASE' |
  'GIFT' | 'OTHER' | 'VENDOR_PAYMENT' | 'EVIDENCE_ONLY';
export type Confirmation = 'USER_CONFIRMED' | 'REVIEW_ONLY';
export type SettlementOpening = {
  date: string; amountKr: number; confirmed: true; evidenceRef: string;
};
export type SettlementEvent = {
  id: string; companyId: number; personId: number;
  date: string; kind: SettlementKind; amountKr: number;
  confirmation: Confirmation; evidenceRef: string | null;
  allocationKey: string; vehicleRegistration: string | null;
};
export type SettlementRow = SettlementEvent & { effectKr: number; balanceKr: number | null };
export type SettlementProjection = {
  companyId: number; personId: number; from: string; through: string;
  openingKr: number | null; deltaKr: number; balanceKr: number | null;
  confirmedCount: number; reviewCount: number;
  rows: SettlementRow[]; vehicleChargedKr: Record<string, number>;
  /** Calculated only: no assertion that all sources are present. */
  status: 'REVIEW_ONLY';
};
const KINDS: readonly SettlementKind[] = [
  'COST','ADVANCE','REPAYMENT','WAIVER','CORRECTION_INCREASE',
  'CORRECTION_DECREASE','GIFT','OTHER','VENDOR_PAYMENT','EVIDENCE_ONLY',
];
const MAX_MONEY = 10_000_000_000;
function validMoney(n: number, allowZero = false): boolean {
  return typeof n === 'number' && Number.isSafeInteger(n) &&
    (allowZero ? Math.abs(n) <= MAX_MONEY : n > 0 && n <= MAX_MONEY);
}
function validDate(day: string): boolean {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + 'T00:00:00.000Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10) === day;
}
function safeAdd(a: number, b: number): number {
  const n = a + b;
  if (!Number.isSafeInteger(n) || Math.abs(n) > MAX_MONEY) {
    throw Error('SETTLEMENT_AMOUNT_OVERFLOW');
  }
  return n;
}
function id(n: number): boolean { return Number.isSafeInteger(n) && n > 0; }
function nonempty(s: string | null): boolean {
  return typeof s === 'string' && s.trim().length > 0 && s.length <= 240;
}
function validPlate(plate: string | null): boolean {
  return plate === null || (typeof plate === 'string' &&
    /^[A-Z]{2,3}\d{2,4}$/.test(plate));
}
/** The single mathematical sign rule. Never infer a kind from bank direction. */
export function balanceEffect(kind: SettlementKind, amountKr: number): number {
  if (!KINDS.includes(kind) || !Number.isSafeInteger(amountKr) || amountKr <= 0) throw Error('SETTLEMENT_EFFECT_INVALID');
  switch (kind) {
    case 'COST':
    case 'ADVANCE':
    case 'CORRECTION_INCREASE': return amountKr;
    case 'REPAYMENT':
    case 'WAIVER':
    case 'CORRECTION_DECREASE': return -amountKr;
    case 'GIFT':
    case 'OTHER':
    case 'VENDOR_PAYMENT':
    case 'EVIDENCE_ONLY': return 0;
  }
}
/**
 * Pure projection. A "REVIEW_ONLY" event NEVER changes the balance.
 * The caller must explicitly supply a confirmed opening AND real confirmed
 * events. Unknown opening => null balance, not a manufactured zero.
 * Multiple allocations of a single bank row may have distinct allocationKeys;
 * the calling repository must verify that total allocated <= source amount.
 */
export function projectSettlement(input: {
  companyId: number; personId: number;
  from: string; through: string;
  opening: SettlementOpening | null;
  events: readonly SettlementEvent[];
}): SettlementProjection {
  if (!id(input.companyId) || !id(input.personId) ||
      !validDate(input.from) || !validDate(input.through) || input.through < input.from ||
      !Array.isArray(input.events) || input.events.length > 10000) {
    throw Error('SETTLEMENT_INPUT_INVALID');
  }
  if (input.opening !== null &&
      (input.opening.confirmed !== true || input.opening.date !== input.from ||
       !validMoney(input.opening.amountKr,true) || !nonempty(input.opening.evidenceRef))) {
    throw Error('SETTLEMENT_OPENING_INVALID');
  }
  const seenIds = new Set<string>();
  const allocations = new Set<string>();
  let reviewCount = 0;
  let deltaKr = 0;
  const vehicleChargedKr: Record<string,number> = Object.create(null);
  const events = [...input.events].sort((a,b)=>a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const rows: SettlementRow[] = [];
  for (const e of events) {
    if (!nonempty(e.id) || seenIds.has(e.id) || e.companyId !== input.companyId ||
        e.personId !== input.personId || !validDate(e.date) ||
        e.date < input.from || e.date > input.through ||
        !KINDS.includes(e.kind) || !validMoney(e.amountKr) ||
        (e.confirmation !== 'USER_CONFIRMED' && e.confirmation !== 'REVIEW_ONLY') ||
        !nonempty(e.allocationKey) || !validPlate(e.vehicleRegistration)) {
      throw Error('SETTLEMENT_EVENT_INVALID');
    }
    seenIds.add(e.id);
    if (e.confirmation === 'REVIEW_ONLY') {
      reviewCount++;
      continue;
    }
    if (!nonempty(e.evidenceRef) || allocations.has(e.allocationKey)) {
      throw Error('SETTLEMENT_UNPROVEN_OR_DUPLICATE_ALLOCATION');
    }
    allocations.add(e.allocationKey);
    const change = balanceEffect(e.kind,e.amountKr);
    // A waiver cannot create a negative debt or forgive an unproven amount.
    const balanceBefore = input.opening === null ? null : safeAdd(input.opening.amountKr,deltaKr);
    if (e.kind === 'WAIVER' && (balanceBefore === null || balanceBefore < e.amountKr)) {
      throw Error('SETTLEMENT_WAIVER_EXCEEDS_DEBT');
    }
    deltaKr = safeAdd(deltaKr,change);
    if (e.kind === 'COST' && e.vehicleRegistration !== null) {
      vehicleChargedKr[e.vehicleRegistration] = safeAdd(vehicleChargedKr[e.vehicleRegistration]??0,e.amountKr);
    }
    rows.push({...e,effectKr:change,balanceKr:input.opening===null?null:safeAdd(input.opening.amountKr,deltaKr)});
  }
  return {companyId:input.companyId,personId:input.personId,
    from:input.from,through:input.through,
    openingKr:input.opening?.amountKr ?? null,deltaKr,
    balanceKr:input.opening===null?null:safeAdd(input.opening.amountKr,deltaKr),
    confirmedCount:rows.length,reviewCount,rows,vehicleChargedKr,status:'REVIEW_ONLY'};
}
/** Advisory year boundary; NEVER creates a ledger event or bank transaction. */
export function previewCarryForward(p: SettlementProjection): {
  nextDate: string; openingKr: number; confirmationRequired: true;
} | null {
  if (!/^\d{4}-12-31$/.test(p.through) || p.balanceKr === null) return null;
  const year = Number(p.through.slice(0,4));
  if (!Number.isInteger(year) || year>=9999) return null;
  return {nextDate:`${year+1}-01-01`,openingKr:p.balanceKr,confirmationRequired:true};
}
