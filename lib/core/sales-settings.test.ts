import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeSalesTerminalCode,
  normalizeSalesTerminalName,
  parseSalesTerminalType,
} from "./sales-settings";

test("sales terminal code is normalized deterministically", () => {
  assert.equal(normalizeSalesTerminalCode("  kassi-01  "), "KASSI-01");
});

test("sales terminal name keeps user casing but trims whitespace", () => {
  assert.equal(normalizeSalesTerminalName("  Kassi við inngang  "), "Kassi við inngang");
});

test("sales terminal settings reject empty or oversized values", () => {
  assert.throws(() => normalizeSalesTerminalCode("   "), /INVALID_SALES_TERMINAL_CODE/);
  assert.throws(() => normalizeSalesTerminalName("x".repeat(161)), /INVALID_SALES_TERMINAL_NAME/);
});

test("sales terminal type is fail-closed", () => {
  assert.equal(parseSalesTerminalType("POS"), "POS");
  assert.equal(parseSalesTerminalType("MOBILE"), "MOBILE");
  assert.throws(() => parseSalesTerminalType("TABLET"), /INVALID_SALES_TERMINAL_TYPE/);
});
