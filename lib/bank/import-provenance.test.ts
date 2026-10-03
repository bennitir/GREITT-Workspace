import assert from "node:assert/strict";
import test from "node:test";

import { sourceFileSha256, sourceFileSize } from "./import-provenance";

test("source file provenance is deterministic for identical bytes", () => {
  const a = Buffer.from("same-bank-file", "utf8");
  const b = Buffer.from("same-bank-file", "utf8");

  assert.equal(sourceFileSha256(a), sourceFileSha256(b));
  assert.equal(sourceFileSize(a), sourceFileSize(b));
});

test("source file provenance changes when source bytes change", () => {
  const a = Buffer.from("bank-file-a", "utf8");
  const b = Buffer.from("bank-file-b", "utf8");

  assert.notEqual(sourceFileSha256(a), sourceFileSha256(b));
});

test("source file SHA-256 matches the standard abc vector", () => {
  assert.equal(
    sourceFileSha256(Buffer.from("abc", "utf8")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(sourceFileSize(Buffer.from("abc", "utf8")), 3);
});
