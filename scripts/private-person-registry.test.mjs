import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizePrivatePersonName,normalizePrivatePersonCategory,normalizePrivatePersonNote,registeredPrivatePersonCategory} from '../lib/personal-finance/private-person-registry-policy.ts';
const src=(f)=>readFileSync(new URL('../'+f,import.meta.url),'utf8');

test('name normalizes Icelandic spelling without learning from banking text',()=>{
  assert.equal(normalizePrivatePersonName('  Guðrún   Jónsdóttir  '),'Guðrún Jónsdóttir');
  assert.equal(normalizePrivatePersonName('1234'),null);
  assert.equal(normalizePrivatePersonName('A'),null);
  assert.equal(normalizePrivatePersonName('A'.repeat(121)),null);
});
test('categories handle children and all other private persons',()=>{
 for(const k of ['CHILD','FAMILY','FRIEND','ACQUAINTANCE','OTHER']) assert.equal(normalizePrivatePersonCategory(k),k);
 assert.equal(normalizePrivatePersonCategory('LOAN'),null);
});
test('note bounded and cannot carry control characters',()=>{
 assert.equal(normalizePrivatePersonNote(' Erindi  '),'Erindi');
 assert.equal(normalizePrivatePersonNote('a'.repeat(301)),null);
});
test('only explicit registry marker recognizes a contact',()=>{
 assert.equal(registeredPrivatePersonCategory({privatePersonRegistry:'v1',privatePersonCategory:'CHILD'}),'CHILD');
 assert.equal(registeredPrivatePersonCategory({privatePersonCategory:'CHILD'}),null);
 assert.equal(registeredPrivatePersonCategory({privatePersonRegistry:'v1',privatePersonCategory:'LOAN'}),null);
});
test('new person requires owner membership and explicit action',()=>{
 const s=src('app/banki/einstaklingar/actions.ts');
 assert.match(s,/requireActiveCompanyReadAccess/); assert.match(s,/OWNER/);assert.match(s,/ADMIN/);
 assert.match(s,/registerPrivatePerson\(formData:FormData\)/);
 assert.match(s,/companyId,entityType:'PERSON'/);
 assert.match(s,/source:'USER'/);
});
test('creation and audit share serializable transaction',()=>{
 const s=src('app/banki/einstaklingar/actions.ts');
 assert.match(s,/prisma\.\$transaction/);assert.match(s,/isolationLevel:'Serializable'/);
 assert.match(s,/tx\.insightEntity\.create/);assert.match(s,/tx\.auditEvent\.create/);
});
test('existing canonical person must be explicitly selected and is not auto-merged',()=>{
 const s=src('app/banki/einstaklingar/actions.ts');
 assert.match(s,/return 'duplicate'/);assert.match(s,/attachPrivatePerson\(formData:FormData\)/);
 assert.match(s,/entityId=Number\(formData.get\('entityId'\)\)/);
 assert.match(s,/EXPLICIT_OWNER_LINK/);
});
test('no banking, booking or balance writes in contact action',()=>{
 const s=src('app/banki/einstaklingar/actions.ts');
 for(const term of ['bankTransaction.update','financialReconciliation.create','receiptEntry.create','familyTransferSplit.create']) assert.ok(!s.includes(term),term);
});
test('registry UI has real save button, search reuse and private scope',()=>{
 const s=src('app/banki/einstaklingar/page.tsx');
 assert.match(s,/action={registerPrivatePerson}/);assert.match(s,/action={attachPrivatePerson}/);
 assert.match(s,/metadata:\{path:\['privatePersonRegistry'\]/);
 assert.match(s,/Engin kennitala er nauðsynleg/);
});
test('family page shows explicitly registered children only and leaves amounts unknown',()=>{
 const p=src('app/banki/fjolskylda/page.tsx'); const c=src('app/banki/fjolskylda/StandaloneFamilyOverview.tsx');
 assert.match(p,/privatePersonCategory==='CHILD'/);
 assert.match(c,/Skuld, afborganir og gjafir: Óstaðfest/);
 assert.match(p,/registeredChildren={registeredChildren}/);
});
