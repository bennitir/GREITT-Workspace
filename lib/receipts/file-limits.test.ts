import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertReceiptSize,
  appendReceiptFiles,
  RECEIPT_MAX_BYTES,
  RECEIPT_EMPTY_MESSAGE,
  RECEIPT_FILE_TYPE_MESSAGE,
  RECEIPT_SIZE_MESSAGE,
  selectReceiptFiles,
} from "./file-limits";
import nextConfig from "../../next.config";

describe("receipt file size limits", () => {
  it("accepts files up to and including the 3 MB limit", () => {
    assert.doesNotThrow(() => assertReceiptSize(1));
    assert.doesNotThrow(() => assertReceiptSize(RECEIPT_MAX_BYTES));
  });

  it("rejects empty, invalid, and oversized files with the shared message", () => {
    for (const size of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, RECEIPT_MAX_BYTES + 1]) {
      assert.throws(() => assertReceiptSize(size), {
        message: RECEIPT_SIZE_MESSAGE,
      });
    }
  });

  it("accepts a synthetic PDF under the limit and reports an oversized PDF in Icelandic", () => {
    const pdf = new File(["%PDF-1.7 synthetic"], "receipt.pdf", {
      type: "application/pdf",
    });
    const oversizedPdf = new File(
      [new Uint8Array(RECEIPT_MAX_BYTES + 1)],
      "large.pdf",
      { type: "application/pdf" },
    );

    assert.doesNotThrow(() => assertReceiptSize(pdf.size));
    assert.equal(
      selectReceiptFiles([oversizedPdf]).hasOversizedFiles,
      true,
    );
    assert.throws(
      () => assertReceiptSize(oversizedPdf.size),
      { message: "Fylgiskjal má vera að hámarki 3 MB. Veldu minni skrá." },
    );
  });

  it("keeps image support and valid files in a mixed multi-file selection", () => {
    const pdf = new File(["%PDF-1.7 synthetic"], "receipt.pdf", {
      type: "application/pdf",
    });
    const image = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "scan.png", {
      type: "image/png",
    });
    const oversizedPdf = new File(
      [new Uint8Array(RECEIPT_MAX_BYTES + 1)],
      "large.pdf",
      { type: "application/pdf" },
    );

    const selection = selectReceiptFiles([pdf, oversizedPdf, image]);

    assert.deepEqual(selection.acceptedFiles, [pdf, image]);
    assert.equal(selection.hasOversizedFiles, true);
    assert.doesNotThrow(() => assertReceiptSize(image.size));
  });

  it("rejects an empty file at selection time without confusing it with oversized files", () => {
    const emptyFile = new File([], "empty.pdf", { type: "application/pdf" });
    const result = selectReceiptFiles([emptyFile]);

    assert.deepEqual(result.acceptedFiles, []);
    assert.equal(result.hasEmptyFiles, true);
    assert.equal(result.hasOversizedFiles, false);
    assert.match(RECEIPT_EMPTY_MESSAGE, /Tómar skrár/);
  });

  it("accepts valid files when mixed with both empty and oversized files", () => {
    const validFile = new File(["valid"], "valid.pdf", { type: "application/pdf" });
    const emptyFile = new File([], "empty.pdf", { type: "application/pdf" });
    const oversizedFile = new File(
      [new Uint8Array(RECEIPT_MAX_BYTES + 1)],
      "large.pdf",
      { type: "application/pdf" },
    );

    const result = selectReceiptFiles([emptyFile, validFile, oversizedFile]);
    assert.deepEqual(result.acceptedFiles, [validFile]);
    assert.equal(result.hasEmptyFiles, true);
    assert.equal(result.hasOversizedFiles, true);
  });

  it("rejects unsupported types dropped onto the form while keeping valid files", () => {
    const script = new File(["not a receipt"], "run.js", { type: "text/javascript" });
    const pdf = new File(["%PDF-1.7 synthetic"], "receipt.pdf", { type: "application/pdf" });
    const selected = selectReceiptFiles([script, pdf]);

    assert.deepEqual(selected.acceptedFiles, [pdf]);
    assert.equal(selected.hasUnsupportedFiles, true);
    assert.equal(selected.hasOversizedFiles, false);
    assert.equal(selected.hasEmptyFiles, false);
    assert.match(RECEIPT_FILE_TYPE_MESSAGE, /PDF/);
  });

  it("accepts PDF when the browser provides no MIME type", () => {
    const pdf = new File(["%PDF-1.7 synthetic"], "scan.PDF");
    const result = selectReceiptFiles([pdf]);
    assert.deepEqual(result.acceptedFiles, [pdf]);
    assert.equal(result.hasUnsupportedFiles, false);
  });

  it("adds later selections without losing earlier receipts or double-adding the same File object", () => {
    const original = new File(["a"], "first.pdf", { type: "application/pdf" });
    const added = new File(["b"], "second.pdf", { type: "application/pdf" });
    assert.deepEqual(appendReceiptFiles([original], [original, added]), [original, added]);
    assert.deepEqual(appendReceiptFiles([original], []), [original]);
  });

  it("does not discard distinct documents just because their filenames and sizes match", () => {
    const a = new File(["x"], "receipt.pdf", { type: "application/pdf" });
    const b = new File(["y"], "receipt.pdf", { type: "application/pdf" });
    assert.deepEqual(appendReceiptFiles([a], [b]), [a, b]);
  });

  it("preserves the shared Server Actions cap while enforcing the receipt-specific limit", () => {
    // Other modules also use Server Actions. Keep their global cap intact.
    // The smaller per-receipt 3 MiB cap is enforced by assertReceiptSize.
    assert.equal(nextConfig.experimental?.serverActions?.bodySizeLimit, "10mb");
    assert.ok(RECEIPT_MAX_BYTES < 10 * 1024 * 1024);
  });
});
