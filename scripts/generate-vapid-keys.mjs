import { createECDH } from "node:crypto";

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const ecdh = createECDH("prime256v1");
ecdh.generateKeys();

console.log("WEB_PUSH_VAPID_PUBLIC_KEY=" + base64Url(ecdh.getPublicKey()));
console.log("WEB_PUSH_VAPID_PRIVATE_KEY=" + base64Url(ecdh.getPrivateKey()));
console.log("WEB_PUSH_VAPID_SUBJECT=https://gloggt.is");
