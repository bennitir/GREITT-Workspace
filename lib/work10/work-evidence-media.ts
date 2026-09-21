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

export async function saveWorkEvidencePhoto(
  file: File | null,
  companyId: number,
  workOrderId: number,
  workPartId: number | null,
  stage: string,
) {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("Sönnunarmynd þarf að vera myndskrá.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Sönnunarmynd má ekki vera stærri en 12 MB.");

  const safeStage = stage.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  const partSegment = workPartId ? `/parts/${workPartId}` : "";
  const storagePath = `verk/${companyId}/work/${workOrderId}${partSegment}/evidence/${safeStage}/${Date.now()}-${randomBytes(6).toString("hex")}.${extensionFor(file)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`Mistókst að vista sönnunarmynd: ${error.message}`);
  return storagePath;
}

export async function removeWorkEvidenceMedia(storagePath: string | null) {
  if (!storagePath) return;
  await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
}

export async function signedWorkEvidenceMediaUrl(storagePath: string | null, expiresInSeconds = 3600) {
  if (!storagePath) return null;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data.signedUrl;
}
