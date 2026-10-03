import { createHash } from "crypto";

export function sourceFileSha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function sourceFileSize(bytes: Uint8Array) {
  return bytes.byteLength;
}
