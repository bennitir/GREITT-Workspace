"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { messagesText } from "@/lib/i18n/messages";
import { prisma } from "@/lib/prisma";

function clean(value: FormDataEntryValue | null) { return String(value ?? "").trim(); }

async function currentMessageText(userId: number) {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { interfaceLanguage: true } });
  return messagesText(settings?.interfaceLanguage ?? "is");
}

export async function createCompanyMessage(formData: FormData) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const t = await currentMessageText(user.id);
  const companyId = Number(formData.get("companyId"));
  const recipientUserId = Number(formData.get("recipientUserId"));
  const subject = clean(formData.get("subject"));
  const body = clean(formData.get("body"));
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error(t.invalidCompany);
  if (!Number.isInteger(recipientUserId) || recipientUserId <= 0) throw new Error(t.chooseRecipient);
  if (!subject || !body) throw new Error(t.subjectBodyRequired);

  const access = await getCompanyAccess(companyId);
  if (!access.allowed || !(user.role === "ADMIN" || access.canWrite)) throw new Error(t.noSendPermission);

  const recipientAccess = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: recipientUserId, companyId } },
    include: { user: { select: { isActive: true } } },
  });
  if (!recipientAccess?.isActive || !recipientAccess.user.isActive) throw new Error(t.inactiveRecipient);

  await prisma.companyMessage.create({ data: { companyId, recipientUserId, createdByUserId: user.id, subject, body } });
  revalidatePath("/");
  revalidatePath("/verkefni");
  revalidatePath("/skilabod");
  redirect("/skilabod?box=sent");
}

async function getOwnedMessage(messageId: number, userId: number) {
  return prisma.companyMessage.findFirst({ where: { id: messageId, recipientUserId: userId }, select: { id: true } });
}

export async function markCompanyMessageRead(messageId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const t = await currentMessageText(user.id);
  if (!await getOwnedMessage(messageId, user.id)) throw new Error(t.messageNotFound);
  await prisma.companyMessage.update({ where: { id: messageId }, data: { readAt: new Date() } });
  revalidatePath("/"); revalidatePath("/skilabod");
}

export async function markCompanyMessageUnread(messageId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const t = await currentMessageText(user.id);
  if (!await getOwnedMessage(messageId, user.id)) throw new Error(t.messageNotFound);
  await prisma.companyMessage.update({ where: { id: messageId }, data: { readAt: null } });
  revalidatePath("/"); revalidatePath("/skilabod");
}

export async function archiveCompanyMessage(messageId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const t = await currentMessageText(user.id);
  if (!await getOwnedMessage(messageId, user.id)) throw new Error(t.messageNotFound);
  await prisma.companyMessage.update({ where: { id: messageId }, data: { archivedAt: new Date(), trashedAt: null, readAt: new Date() } });
  revalidatePath("/"); revalidatePath("/skilabod");
}

export async function restoreCompanyMessage(messageId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const t = await currentMessageText(user.id);
  if (!await getOwnedMessage(messageId, user.id)) throw new Error(t.messageNotFound);
  await prisma.companyMessage.update({ where: { id: messageId }, data: { archivedAt: null, trashedAt: null } });
  revalidatePath("/"); revalidatePath("/skilabod");
}

export async function trashCompanyMessage(messageId: number) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const t = await currentMessageText(user.id);
  if (!await getOwnedMessage(messageId, user.id)) throw new Error(t.messageNotFound);
  await prisma.companyMessage.update({ where: { id: messageId }, data: { trashedAt: new Date(), archivedAt: null, readAt: new Date() } });
  revalidatePath("/"); revalidatePath("/skilabod");
}
