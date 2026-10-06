import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(path.join(root, relativePath), "utf8");

function section(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

test("review is bound to an exact content revision and booking rejects stale review", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /contentRevision\s+Int\s+@default\(1\)/);
  assert.match(schema, /reviewedContentRevision\s+Int\?/);

  const actions = read("app/actions/receiptActions.ts");
  const review = section(
    actions,
    "export async function reviewDetectedDocument",
    "export async function continueLegacyDetectedDocumentWithManualDraft",
  );
  assert.match(review, /contentRevision:\s*document\.contentRevision/);
  assert.match(review, /reviewedContentRevision:\s*document\.contentRevision/);
  assert.match(review, /reviewClaim\.count !== 1/);

  const approve = section(
    actions,
    "export async function approveDetectedDocument",
    "export async function approveManualReceipt",
  );
  assert.match(
    approve,
    /document\.reviewedContentRevision !== document\.contentRevision/,
  );
});

test("canonical content mutations use one serializable revision claim", () => {
  const actions = read("app/actions/receiptActions.ts");
  const helper = section(
    actions,
    "async function claimDetectedDocumentContentMutation",
    "async function saveReceiptFile",
  );
  assert.match(helper, /contentRevision:\s*\{ increment: 1 \}/);
  assert.match(helper, /reviewedAt:\s*null/);
  assert.match(helper, /reviewedContentRevision:\s*null/);
  assert.match(helper, /invalidateReviewedFinancialDerivationsForContentChange/);
  assert.match(helper, /status:\s*"REVIEWED"/);
  assert.match(helper, /data:\s*\{ status: "NEW" \}/);
  assert.match(helper, /INVALIDATE_DOCUMENT_REVIEW_CONTENT_CHANGED/);

  const mutations = [
    ["prepareExistingReceiptManually", "addReceiptEntries"],
    ["applyConfirmedBookingSuggestions", "reviewDetectedDocument"],
    ["continueLegacyDetectedDocumentWithManualDraft", "updateDetectedDocumentMerchant"],
    ["updateDetectedDocumentMerchant", "confirmDetectedDocumentEnvironment"],
    ["setDetectedDocumentVatDeduction", "updateDetectedDocumentEntries"],
    ["updateDetectedDocumentEntries", "addDetectedDocumentEntry"],
    ["addDetectedDocumentEntry", "rebuildDetectedDocumentBookingSuggestion"],
    ["rebuildDetectedDocumentBookingSuggestion", "deleteDetectedDocumentEntry"],
    ["deleteDetectedDocumentEntry", "deleteDetectedDocument"],
    ["createLiabilityAccountForDetectedDocument", "createAccountForDetectedDocument"],
  ] as const;

  for (const [name, next] of mutations) {
    const source = section(
      actions,
      `export async function ${name}`,
      `export async function ${next}`,
    );
    assert.match(source, /claimDetectedDocumentContentMutation/,
      `${name} must claim a content revision`);
    assert.match(source, /TransactionIsolationLevel\.Serializable/,
      `${name} must coordinate with confirmation transactions`);
  }
});

test("derived FinancialEvent is staled fail-closed and re-review refreshes the same id", () => {
  const materialization = read("lib/receipts/financial-event-materialization.ts");
  assert.match(materialization, /DOCUMENT_CONFIRMED_RECONCILIATION/);
  assert.match(materialization, /EVENT_CONFIRMED_PAYMENT/);
  assert.match(materialization, /EVENT_CONFIRMED_ALLOCATION/);
  assert.match(materialization, /EVENT_CONFIRMED_RECONCILIATION/);
  assert.match(materialization, /EVENT_PAID_SCHEDULE/);
  assert.match(materialization, /role:\s*"STALE_PRIMARY"/);
  assert.match(materialization, /amount:\s*null/);
  assert.match(materialization, /eventDate:\s*null/);
  assert.match(materialization, /financialEvent\.update/);
  assert.match(materialization, /data:\s*\{ role: "PRIMARY", source: "REVIEWED_DOCUMENT" \}/);
});

test("reconciliation consumers reject stale reviewed source revisions", () => {
  const service = read("lib/financial-reconciliation/event-service.ts");
  assert.match(service, /contentRevision:\s*true/);
  assert.match(service, /reviewedContentRevision:\s*true/);
  assert.match(
    service,
    /link\.document\.reviewedContentRevision === link\.document\.contentRevision/,
  );
  assert.match(service, /link\.role !== "PRIMARY"/);

  for (const file of [
    "lib/financial-reconciliation/reviewed-document-confirmation.ts",
    "lib/financial-reconciliation/card-reviewed-document-confirmation.ts",
  ]) {
    const source = read(file);
    assert.match(source, /DOCUMENT_REVIEW_STALE/);
    assert.match(
      source,
      /document\.reviewedContentRevision !== document\.contentRevision/,
    );
  }
});
