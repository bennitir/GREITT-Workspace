import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} from "node:crypto";

function base64UrlEncode(value: Buffer | string) {
  const buffer = typeof value === "string" ? Buffer.from(value) : value;
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function hmacSha256(key: Buffer, data: Buffer) {
  return createHmac("sha256", key).update(data).digest();
}

function hkdfExpand(prk: Buffer, info: Buffer, length: number) {
  const chunks: Buffer[] = [];
  let previous = Buffer.alloc(0);
  let counter = 1;

  while (Buffer.concat(chunks).length < length) {
    previous = hmacSha256(
      prk,
      Buffer.concat([previous, info, Buffer.from([counter])]),
    );
    chunks.push(previous);
    counter += 1;
  }

  return Buffer.concat(chunks).subarray(0, length);
}

function createVapidJwt(endpoint: string, publicKey: string, privateKey: string, subject: string) {
  const publicBytes = base64UrlDecode(publicKey);
  const privateBytes = base64UrlDecode(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4) {
    throw new Error("WEB_PUSH_VAPID_PUBLIC_KEY must be an uncompressed P-256 key.");
  }
  if (privateBytes.length !== 32) {
    throw new Error("WEB_PUSH_VAPID_PRIVATE_KEY must be a 32-byte P-256 private key.");
  }

  const x = publicBytes.subarray(1, 33);
  const y = publicBytes.subarray(33, 65);
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(x),
      y: base64UrlEncode(y),
      d: base64UrlEncode(privateBytes),
    },
    format: "jwk",
  });

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      exp: now + 12 * 60 * 60,
      sub: subject,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function encryptPayload(payload: string, receiverPublicKey: string, authSecret: string) {
  const receiverPublic = base64UrlDecode(receiverPublicKey);
  const auth = base64UrlDecode(authSecret);
  if (receiverPublic.length !== 65 || receiverPublic[0] !== 4) {
    throw new Error("Invalid PushSubscription p256dh key.");
  }
  if (auth.length === 0) {
    throw new Error("Invalid PushSubscription auth secret.");
  }

  const sender = createECDH("prime256v1");
  sender.generateKeys();
  const senderPublic = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(receiverPublic);

  const authPrk = hmacSha256(auth, sharedSecret);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    receiverPublic,
    senderPublic,
  ]);
  const ikm = hkdfExpand(authPrk, keyInfo, 32);

  const salt = randomBytes(16);
  const prk = hmacSha256(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from("Content-Encoding: aes128gcm\0", "utf8"), 16);
  const nonce = hkdfExpand(prk, Buffer.from("Content-Encoding: nonce\0", "utf8"), 12);

  const plaintext = Buffer.concat([Buffer.from(payload, "utf8"), Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  const header = Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublic.length]),
    senderPublic,
  ]);

  return Buffer.concat([header, encrypted, authTag]);
}

export type WebPushSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function getWebPushPublicKey() {
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null;
}

export function webPushConfigured() {
  return Boolean(
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim() &&
      process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim(),
  );
}

export async function sendWebPush(
  subscription: WebPushSubscription,
  payload: unknown,
  options?: { ttlSeconds?: number; urgency?: "very-low" | "low" | "normal" | "high" },
) {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim() || "https://gloggt.is";

  if (!publicKey || !privateKey) {
    throw new Error("WEB_PUSH_NOT_CONFIGURED");
  }

  const endpointUrl = new URL(subscription.endpoint);
  if (endpointUrl.protocol !== "https:") {
    throw new Error("WEB_PUSH_ENDPOINT_MUST_USE_HTTPS");
  }

  const body = encryptPayload(JSON.stringify(payload), subscription.p256dh, subscription.auth);
  const jwt = createVapidJwt(subscription.endpoint, publicKey, privateKey, subject);

  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options?.ttlSeconds ?? 300),
      Urgency: options?.urgency ?? "high",
    },
    body,
  });
}
