import assert from "node:assert/strict";
import test from "node:test";

import {
  extractDeterministicLabeledPurchaseInvoiceLines,
  tryParseDeterministicLabeledPurchaseInvoice,
} from "./ingestion";

const novaLikeText = `
NOVA
Nova hf | Lágmúla 9 | 108 Reykjavík
Kennitala 531205-0810 | Vsk. númer 94181

Sturla Ólafsson
KENNITALA 3107712959

REIKNINGUR NR. BR2607-2140760
TÍMABIL NOTKUNAR JÚLÍ 2026
DAGS. 31.7.2026
GJALDDAGI 26.8.2026
EINDAGI 2.9.2026
GREIÐSLUMÁTI Heimabanki

Þjónusta Fjöldi Samtals
Farsími 1 6.590 kr.
Stofnun kröfu í heimabanka 1 189 kr.
Samtals 6.779 kr.

Samantekt á VSK
Skattstofn VSK% VSK Samtals m/VSK
5.467 kr. 24 % 1.312 kr. 6.779 kr.
`;

test("labeled purchase invoice extracts the two printed service lines exactly", () => {
  assert.deepEqual(
    extractDeterministicLabeledPurchaseInvoiceLines(novaLikeText).map((line) => ({
      description: line.description,
      quantity: line.quantity,
      lineTotal: line.lineTotal,
    })),
    [
      { description: "Farsími", quantity: 1, lineTotal: 6590 },
      { description: "Stofnun kröfu í heimabanka", quantity: 1, lineTotal: 189 },
    ],
  );
});

test("line extraction fails closed when parsed lines do not reconcile to invoice total", () => {
  const corrupted = novaLikeText.replace("1 189 kr.", "1 1.189 kr.");
  assert.deepEqual(extractDeterministicLabeledPurchaseInvoiceLines(corrupted), []);
});

test("deterministic labeled invoice carries purchase lines and avoids AI fallback", () => {
  const parsed = tryParseDeterministicLabeledPurchaseInvoice({
    sourceText: novaLikeText,
    companyName: "Sturla Ólafsson",
    companyKennitala: "3107712959",
  });
  assert.ok(parsed);
  assert.equal(parsed.analysisSource, "DETERMINISTIC_TEMPLATE");
  assert.equal(parsed.templateId, "LABELED_PURCHASE_INVOICE_V1");
  assert.equal(parsed.result.documents[0]?.classificationConfidence, 0.98);
  assert.equal(parsed.result.documents[0]?.purchaseLines.length, 2);
});
