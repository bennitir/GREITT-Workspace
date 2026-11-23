/** Explicit private-person registration, never inferred from bank transaction text. */
export const PRIVATE_PERSON_CATEGORIES = ['CHILD','FAMILY','FRIEND','ACQUAINTANCE','OTHER'] as const;
export type PrivatePersonCategory = typeof PRIVATE_PERSON_CATEGORIES[number];
export const PRIVATE_PERSON_REGISTRY_VERSION = 'v1';
export const PRIVATE_PERSON_CATEGORY_TEXT: Record<PrivatePersonCategory,string> = {
  CHILD:'Barn', FAMILY:'Fjölskyldumeðlimur', FRIEND:'Vinur/vinkona',
  ACQUAINTANCE:'Kunningi', OTHER:'Annar einstaklingur',
};
export function normalizePrivatePersonName(raw:unknown): string | null {
  if(typeof raw !== 'string') return null;
  const name=raw.normalize('NFC').trim().replace(/\s+/gu,' ');
  return name.length>=2 && name.length<=120 && /\p{L}/u.test(name) &&
    !/[\u0000-\u001f\u007f]/u.test(name) ? name : null;
}
export function normalizePrivatePersonCategory(raw:unknown):PrivatePersonCategory|null {
  return typeof raw==='string' && (PRIVATE_PERSON_CATEGORIES as readonly string[]).includes(raw)
    ? raw as PrivatePersonCategory : null;
}
export function normalizePrivatePersonNote(raw:unknown):string|null {
  if(typeof raw!=='string') return null;
  const note=raw.normalize('NFC').trim();
  return note.length<=300 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(note)
    ? note : null;
}
export function registeredPrivatePersonCategory(metadata:unknown):PrivatePersonCategory|null {
  if(!metadata || typeof metadata!=='object' || Array.isArray(metadata)) return null;
  const o=metadata as Record<string,unknown>;
  if(o.privatePersonRegistry!==PRIVATE_PERSON_REGISTRY_VERSION) return null;
  return normalizePrivatePersonCategory(o.privatePersonCategory);
}
