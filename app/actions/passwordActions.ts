"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function changeRequiredPassword(formData: FormData) {
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!newPassword || !confirmPassword) {
    throw new Error("Fylla þarf út bæði lykilorðasvæðin.");
  }

  if (newPassword.length < 10) {
    throw new Error(
      "Nýja lykilorðið verður að vera að minnsta kosti 10 stafir."
    );
  }

  if (newPassword !== confirmPassword) {
    throw new Error("Lykilorðin eru ekki eins.");
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

  if (!sessionToken) {
    redirect("/innskraning");
  }

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.user.isActive
  ) {
    cookieStore.delete("sessionToken");
    cookieStore.delete("activeCompanyId");
    cookieStore.delete("activeUserId");

    redirect("/innskraning");
  }

  if (!session.user.mustChangePassword) {
    throw new Error(
      "Þessi aðgerð er aðeins leyfð þegar skylt er að breyta lykilorði."
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: session.user.id },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    }),

    prisma.session.deleteMany({
      where: {
        userId: session.user.id,
        token: {
          not: sessionToken,
        },
      },
    }),
  ]);

  cookieStore.delete("activeCompanyId");
  cookieStore.delete("activeUserId");

  redirect("/");
}