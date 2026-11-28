import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const bank = read("../../app/banki/actions.ts");
const card = read("../../app/banki/kort/actions.ts");
const legacyActions = read("../../app/actions/customerActions.ts");
const receiptActions = read("../../app/actions/receiptActions.ts");

function exported(source: string, name: string): string {
  const begin = source.indexOf(`export async function ${name}(`);
  assert.ok(begin >= 0, `${name}: missing exported action`);
  const end = source.indexOf("\nexport async function ", begin + 10);
  return source.slice(begin, end < 0 ? undefined : end);
}

for (const [source, functionName, contextCall] of [
  [bank, "createBankAccount", 'bankContext(undefined, "prepare")'],
  [bank, "createBankTransaction", 'bankContext(undefined, "prepare")'],
  [bank, "previewBankStatement", 'bankContext(undefined, "prepare")'],
  [bank, "cancelBankImport", 'bankContext(undefined, "prepare")'],
  [bank, "confirmBankImport", 'bankContext(undefined, "prepare")'],
  [card, "createPaymentCard", 'cardContext("prepare")'],
  [card, "previewPaymentCardStatement", 'cardContext("prepare")'],
  [card, "cancelPaymentCardImport", 'cardContext("prepare")'],
  [card, "confirmPaymentCardImport", 'cardContext("prepare")'],
] as const) {
  test(`${functionName} requires explicit prepare capability before mutation`, () => {
    const action = exported(source, functionName);
    assert.ok(action.includes(contextCall), `${functionName}: capability guard is missing`);
    assert.ok(action.indexOf(contextCall) < action.indexOf("prisma."), `${functionName}: must guard before first DB query`);
  });
}

for (const [source, contextName] of [
  [bank, "bankContext"], [card, "cardContext"],
] as const) {
  test(`${contextName} uses company-scoped effective capability, not session membership alone`, () => {
    const declaration = source.indexOf(`async function ${contextName}(`);
    const end = source.indexOf("return { companyId, userId: session.user.id }", declaration);
    assert.ok(declaration >= 0 && end > declaration);
    const contextBody = source.slice(declaration, end);
    assert.match(contextBody, /requireFinancialSourcePrepareAccess\(await getCompanyAccess\(companyId\)\)/);
    assert.match(contextBody, /requiredCapability === "prepare"/);
  });
}

test("legacy Customer CRUD cannot access unscoped customer data", () => {
  for (const name of ["createCustomer", "updateCustomer", "deleteCustomer"]) {
    assert.match(exported(legacyActions, name), /legacyCustomerDisabled\(\)/);
  }
  assert.doesNotMatch(legacyActions, /prisma\.customer/);
  for (const route of [
    "../../app/vidskiptavinir/page.tsx",
    "../../app/vidskiptavinir/nytt/page.tsx",
    "../../app/vidskiptavinir/[id]/page.tsx",
    "../../app/vidskiptavinir/[id]/breyta/page.tsx",
  ]) assert.doesNotMatch(read(route), /prisma\.customer/);
});

test("legacy AI posting is fail-closed and demo entries are not created", () => {
  assert.match(exported(receiptActions, "approveAiSuggestion"), /throw new Error\("Eldri AI-bókunarleið/);
  const demo = exported(receiptActions, "addReceiptEntries");
  assert.match(demo, /requireActiveCompanyBookAccess/);
  assert.match(demo, /where: \{ id: receiptId, companyId \}/);
  assert.match(demo, /throw new Error\("Þessi eldri bókunarleið/);
  assert.doesNotMatch(demo, /receiptEntry\.createMany/);
});
