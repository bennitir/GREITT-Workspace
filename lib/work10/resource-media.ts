import "server-only";

import { randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase";

const BUCKET = "fylgiskjol";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length <= 8) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "jpg";
}

export async function saveWorkResourceMeterPhoto(file: File | null, companyId: number, workResourceId: number) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Mælamynd þarf að vera myndskrá.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Mælamynd má ekki vera stærri en 12 MB.");

  const storagePath = `verk/${companyId}/resources/${workResourceId}/meter/${Date.now()}-${randomBytes(6).toString("hex")}.${extensionFor(file)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Mistókst að vista mælamynd: ${error.message}`);
  return storagePath;
}

export async function removeWorkResourceMedia(storagePath: string | null) {
  if (!storagePath) return;
  await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
}

export async function signedWorkResourceMediaUrl(storagePath: string | null, expiresInSeconds = 3600) {
  if (!storagePath) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
