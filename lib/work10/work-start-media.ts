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

export async function saveDiaryWorkStartPhoto(
  file: File | null,
  companyId: number,
  employeeId: number,
) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Upphafsmynd þarf að vera myndskrá.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Upphafsmynd má ekki vera stærri en 12 MB.");

  const storagePath = `verk/${companyId}/diary/${employeeId}/start/${Date.now()}-${randomBytes(6).toString("hex")}.${extensionFor(file)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Mistókst að vista upphafsmynd: ${error.message}`);
  return storagePath;
}

export async function removeWorkStartMedia(storagePath: string | null) {
  if (!storagePath) return;
  await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
}
