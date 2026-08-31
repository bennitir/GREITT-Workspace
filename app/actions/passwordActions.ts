"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendPasswordResetEmail } from "@/lib/email";

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

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();

  if (!email) {
    redirect("/gleymt-lykilord?sent=1");
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  // Við gefum aldrei upp hvort netfang sé skráð í kerfinu.
  if (!user || !user.isActive) {
    redirect("/gleymt-lykilord?sent=1");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
    }),

    prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    }),
  ]);

  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://www.gloggt.is"
      : "http://localhost:3000";

  const resetUrl =
    `${baseUrl}/endurstilla-lykilord?token=${encodeURIComponent(token)}`;

  await sendPasswordResetEmail({
    name: user.name,
    email: user.email,
    resetUrl,
  });

  redirect("/gleymt-lykilord?sent=1");
}

export async function resetPassword(formData: FormData) {
  const token = String(formData.get("token") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!token) {
    throw new Error("Endurstillingarhlekkurinn er ógildur.");
  }

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

  const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (
    !resetToken ||
    resetToken.usedAt ||
    resetToken.expiresAt <= new Date() ||
    !resetToken.user.isActive
  ) {
    throw new Error(
      "Endurstillingarhlekkurinn er ógildur eða útrunninn."
    );
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
      },
    }),

    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        usedAt: new Date(),
      },
    }),

    prisma.session.deleteMany({
      where: {
        userId: resetToken.userId,
      },
    }),
  ]);

  redirect("/innskraning?passwordReset=1");
}