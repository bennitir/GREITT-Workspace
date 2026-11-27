/**
 * Read-only evidence discovery for a family member. Never interprets a matching
 * supplier, plate or person's name as an actual liability or completed payment.
 */
export const HISTORY_YEARS = [2025, 2026] as const;
export const REVIEW_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12] as const;
export const HISTORICAL_CUTOFF = '2026-06-01';
export const HISTORY_BANK_LIMIT = 500;
export const HISTORY_RECEIPT_LIMIT = 300;
export type EvidenceKind = 'PERSON'|'PLATE'|'MILEAGE_FEE'|'INSURANCE'|'VEHICLE_TAX'|'VEHICLE_SERVICE'|'LENDER';
export const EVIDENCE_LABELS: Record<EvidenceKind,string> = {
  PERSON: 'Nafn einstaklings í texta',
  PLATE: 'Bílnúmer í heimild',
  MILEAGE_FEE: 'Mögulegt kílómetragjald',
  INSURANCE: 'Mögulegar tryggingar',
  VEHICLE_TAX: 'Mögulegt bifreiðagjald',
  VEHICLE_SERVICE: 'Mögulegur bifreiðakostnaður',
  LENDER: 'Lánveitandi; lán óstaðfest',
};
export function historySelection(yearValue:unknown,monthValue:unknown):{year:2025|2026;month:number|null} {
  const year=String(yearValue)==='2025'?2025:2026;
  const month=/^(?:[1-9]|1[0-2])$/.test(String(monthValue??''))?Number(monthValue):null;
  return {year,month};
}
export function historyDateRange(year:2025|2026,month:number|null):{start:Date;end:Date} {
  const m=month??1;
  const nextMonth=month===null?13:m+1;
  const start=new Date(Date.UTC(year,m-1,1));
  const end=new Date(Date.UTC(year+(nextMonth===13?1:0),nextMonth===13?0:nextMonth-1,1));
  return {start,end};
}
export function withinHistoricalPeriod(value:string,year:2025|2026,month:number|null):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const {start,end}=historyDateRange(year,month);
  const d=new Date(value+'T00:00:00.000Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value&&d>=start&&d<end;
}
export function isBeforeCutoff(day:string):boolean{return day<HISTORICAL_CUTOFF;}
function normalize(value:unknown):string{
  return String(value??'').normalize('NFKC').toLocaleLowerCase('is').replace(/\s+/g,' ').trim();
}
// Match complete names/phrases, not fragments inside another person's name.
// Unicode boundaries also protect names containing non-Icelandic letters.
function wholeWord(text:string,word:string):boolean {
  const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[^\\p{L}\\p{N}])'+escaped+'(?=$|[^\\p{L}\\p{N}])','iu').test(text);
}
// Read-only plate evidence: only look for a plate supplied explicitly by caller.
// Bank text often separates letters and numbers with
// a space or dash. These are only search hints, never ownership or a payment.
function plateMentioned(text:string,plate:string):boolean {
  const normalizedPlate=normalize(plate).replace(/[^a-z0-9]/g,'');
  if(normalizedPlate.length<4 || normalizedPlate.length>12)return false;
  const parts=/^([a-z]{1,4})(\d{2,6})$/.exec(normalizedPlate);
  if(!parts)return wholeWord(text,normalizedPlate);
  // Match the same plate separators used by U09 candidate retrieval.
  const spelling=parts[1]+'(?:\\s?[-\\u2010-\\u2015]\\s?|\\s?)'+parts[2];
  return new RegExp('(^|[^\\p{L}\\p{N}])'+spelling+'(?=$|[^\\p{L}\\p{N}])','iu').test(text);
}
function any(text:string,needles:string[]):boolean{return needles.some(n=>text.includes(n));}
export function classifyHistoryEvidence(source:{text?:unknown;reference?:unknown;raw?:unknown},personName:string,plate=''):EvidenceKind[]{
  const text=normalize([source.text,source.reference,source.raw].filter(x=>typeof x==='string').join(' '));
  const kinds:EvidenceKind[]=[];
  const person=normalize(personName);
  if(person.length>=5 && wholeWord(text,person))kinds.push('PERSON');
  if(plateMentioned(text,plate))kinds.push('PLATE');
  if(any(text,['kílómetragjald','kílómetragjöld','kilometragjald','km-gjald','km gjald','kmgjald','vegnotkunargjald']))kinds.push('MILEAGE_FEE');
  if(any(text,['trygging','vátrygging','sjóvá','sjova','verna','tryggingafélag']))kinds.push('INSURANCE');
  if(any(text,['bifreiðagjald','bifreiðagjöld','ökutækjagjald','ökutækjagjöld','bifreiðaskatt']))kinds.push('VEHICLE_TAX');
  if(any(text,['smurning','smurþjónust','hjólbarð','dekkja','aðalskoðun','frumherji','bílaviðgerð','bifreiðaviðgerð']))kinds.push('VEHICLE_SERVICE');
  if(any(text,['ergo fjármögn','ergo fjar','ergo lán']))kinds.push('LENDER');
  return kinds;
}
export function candidateSearchTerms(personName:string,plate=''):string[]{
  return [personName,plate,'kílómetragjald','km gjald','bifreiðagjald','ökutækjagjald',
    'trygging','Sjóvá','Verna','smur','dekk','Frumherji','Ergo'].filter(Boolean);
}
export function summaryKind(kinds:EvidenceKind[]):string {
  if(kinds.includes('PERSON'))return 'Færsla með nafni einstaklings';
  if(kinds.includes('PLATE'))return 'Heimild með bílnúmeri';
  return 'Almenn vísbending — ekki úthlutað á barn eða bíl';
}
export function integerKrFromBank(raw:string):string {
  // Display verbatim numeric content when precision is not a whole ISK; no float money.
  const v=raw.trim();
  if(!/^-?\d+(?:\.0+)?$/.test(v))return `${v} kr. (ekki heil krónutala)`;
  const integer=v.replace(/\.0+$/,'');
  const negative=integer.startsWith('-');
  const digits=integer.replace(/^-/,'');
  const formatted=digits.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return `${negative?'−':'+'}${formatted} kr.`;
}
