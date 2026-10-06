import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const receiptActions = fs.readFileSync(
  path.join(repoRoot, "app/actions/receiptActions.ts"),
  "utf8",
);
const vatActions = fs.readFileSync(
  path.join(repoRoot, "app/actions/vatActions.ts"),
  "utf8",
);

function exportedActionSource(source: string, name: string) {
  const declaration = `export async function ${name}`;
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `${name} must remain an exported action`);

  const rest = source.slice(start + declaration.length);
  const nextMatch = /\n\s*export async function\s+/u.exec(rest);
  const end = nextMatch ? start + declaration.length + nextMatch.index : source.length;
  return source.slice(start, end);
}

function assertContainsAll(name: string, source: string, expected: string[]) {
  for (const token of expected) {
    assert.equal(
      source.includes(token),
      true,
      `${name} must include security contract: ${token}`,
    );
  }
}

test("receipt mutations bind capability and target to the active company", () => {
  const contracts: Array<[string, string[]]> = [
    [
      "analyzeReceiptWithAI",
      [
        "requireActiveCompanyPrepareBookkeepingAccess()",
        "where: { id: receiptId, companyId }",
      ],
    ],
    [
      "addReceiptEntries",
      ["requireActiveCompanyBookAccess()", "where: { id: receiptId, companyId }"],
    ],
    [
      "saveOcrResult",
      ["requireActiveCompanyPrepareBookkeepingAccess()", "companyId"],
    ],
    [
      "approveManualReceipt",
      ["requireActiveCompanyBookAccess()", "companyId"],
    ],
    [
      "addDetectedDocumentEntry",
      ["requireActiveCompanyPrepareBookkeepingAccess()", "receipt: { companyId }"],
    ],
    [
      "deleteDetectedDocumentEntry",
      [
        "requireActiveCompanyPrepareBookkeepingAccess()",
        "document: { receipt: { companyId } }",
      ],
    ],
    [
      "deleteReceipt",
      ["requireActiveCompanyDeleteAccess()", "companyId"],
    ],
    [
      "markDetectedDocumentDuplicate",
      ["requireActiveCompanyReviewBookkeepingAccess()", "receipt: { companyId }"],
    ],
  ];

  for (const [name, expected] of contracts) {
    assertContainsAll(name, exportedActionSource(receiptActions, name), expected);
  }
});

test("AI analysis authorizes and scopes the receipt before taking the analysis lease", () => {
  const source = exportedActionSource(receiptActions, "analyzeReceiptWithAI");
  const authIndex = source.indexOf("requireActiveCompanyPrepareBookkeepingAccess()");
  const scopeIndex = source.indexOf("where: { id: receiptId, companyId }");
  const leaseIndex = source.indexOf("withReceiptAnalysisLease");

  assert.ok(authIndex >= 0 && scopeIndex > authIndex && leaseIndex > scopeIndex);
});

test("duplicate marking scopes both source and canonical target to the active company", () => {
  const source = exportedActionSource(receiptActions, "markDetectedDocumentDuplicate");
  const scopedTargetCount = source.split("receipt: { companyId }").length - 1;

  assert.ok(scopedTargetCount >= 2, "both duplicate candidates must be company-scoped");
  assert.equal(source.includes("duplicateOfDocument.voucherNumber !== duplicateVoucherNumber"), true);
});

test("VAT period creation cannot trust a caller-supplied company id", () => {
  const source = exportedActionSource(vatActions, "createVatPeriod");

  assertContainsAll("createVatPeriod", source, [
    "requireActiveCompanyBookAccess()",
    "companyId !== activeCompanyId",
    "companyId: activeCompanyId",
  ]);
});
