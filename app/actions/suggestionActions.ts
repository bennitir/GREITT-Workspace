"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser, requireCompanyBookAccess } from "@/lib/core/access-control";

export async function submitSuggestion(input: {
  companyId?: number | null;
  entityType?: string | null;
  entityId?: number | null;
  category?: string | null;
  text: string;
}) {
  const user = await getEffectiveUser();
  if (!user || !user.isActive) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  const cleanText = input.text.trim();
  if (cleanText.length < 3) {
    throw new Error("Skrá þarf ábendingu.");
  }

  if (input.companyId != null) {
    await requireCompanyBookAccess(input.companyId);
  }

  const suggestion = await prisma.suggestion.create({
    data: {
      companyId: input.companyId ?? null,
      submittedById: user.id,
      entityType: input.entityType?.trim() || null,
      entityId: input.entityId ?? null,
      category: input.category?.trim() || "GENERAL",
      text: cleanText,
      status: "NEW",
    },
  });

  if (input.entityType === "AI_DETECTED_DOCUMENT" && input.entityId != null) {
    const document = await prisma.aiDetectedDocument.findUnique({
      where: { id: input.entityId },
      select: { receiptId: true },
    });
    if (document) {
      revalidatePath(`/fylgiskjol/${document.receiptId}`);
    }
  }

  revalidatePath("/stjornbord/abendingar");
  return suggestion.id;
}

async function requireRealAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sessionToken")?.value;
  if (!token) throw new Error("Innskráning er nauðsynleg.");

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive || session.user.role !== "ADMIN") {
    throw new Error("Aðeins ADMIN hefur heimild til þessarar aðgerðar.");
  }

  return session.user;
}

export async function updateSuggestionReview(formData: FormData) {
  const admin = await requireRealAdmin();
  const suggestionId = Number(formData.get("suggestionId"));
  const status = String(formData.get("status") ?? "IN_REVIEW").trim();
  const adminNote = String(formData.get("adminNote") ?? "").trim();

  const allowed = new Set(["NEW", "IN_REVIEW", "ACCEPTED", "REJECTED", "IMPLEMENTED"]);
  if (!Number.isInteger(suggestionId) || suggestionId <= 0) {
    throw new Error("Ógilt auðkenni ábendingar.");
  }
  if (!allowed.has(status)) {
    throw new Error("Ógild staða ábendingar.");
  }

  await prisma.suggestion.update({
    where: { id: suggestionId },
    data: {
      status,
      adminNote: adminNote || null,
      reviewedById: admin.id,
      reviewedAt: new Date(),
    },
  });

  revalidatePath("/stjornbord/abendingar");
}
