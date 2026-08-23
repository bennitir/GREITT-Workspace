"use server";
import crypto from "crypto";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createUser(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "CLIENT");

  

  if (!name) {
    throw new Error("Nafn vantar.");
  }

  if (!email) {
    throw new Error("Netfang vantar.");
  }

  if (!password) {
  throw new Error("Lykilorð vantar.");
}

  const allowedRoles = ["ADMIN", "BOOKKEEPER", "CLIENT"];

  if (!allowedRoles.includes(role)) {
    throw new Error("Ógilt hlutverk.");
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (existingUser) {
    throw new Error("Notandi með þetta netfang er þegar skráður.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      isActive: true,
    },
  });

  revalidatePath("/stjornbord");
  redirect("/stjornbord");
}

export async function setUserActive(
  id: number,
  isActive: boolean
) {
  await prisma.user.update({
    where: {
      id,
    },
    data: {
      isActive,
    },
  });

  revalidatePath("/stjornbord");
}
export async function addUserCompany(
  userId: number,
  companyId: number,
  accessRole: string = "MANAGER"
) {
  const allowedAccessRoles = ["OWNER", "MANAGER", "BOOKKEEPER", "VIEWER"];
  if (!allowedAccessRoles.includes(accessRole)) {
    throw new Error("Ógilt aðgangshlutverk.");
  }
  await prisma.userCompany.upsert({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
    update: {
      isActive: true,
      accessRole,
    },
    create: {
      userId,
      companyId,
      isActive: true,
      accessRole,
    },
  });

  revalidatePath("/stjornbord");
}


export async function setUserCompanyRole(
  userId: number,
  companyId: number,
  accessRole: string,
) {
  const allowedAccessRoles = ["OWNER", "MANAGER", "BOOKKEEPER", "VIEWER"];
  if (!allowedAccessRoles.includes(accessRole)) {
    throw new Error("Ógilt aðgangshlutverk.");
  }

  await prisma.userCompany.update({
    where: { userId_companyId: { userId, companyId } },
    data: { accessRole },
  });

  revalidatePath("/stjornbord");
}

export async function removeUserCompany(
  userId: number,
  companyId: number
) {
  await prisma.userCompany.update({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
    data: {
      isActive: false,
    },
  });

  revalidatePath("/stjornbord");
}
export async function setActiveUser(userId: number) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

  const session = sessionToken
    ? await prisma.session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      })
    : null;

  if (
    !session ||
    session.expiresAt < new Date() ||
    !session.user.isActive ||
    session.user.role !== "ADMIN"
  ) {
    throw new Error("Aðeins ADMIN má prófa sem annar notandi.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Notandi fannst ekki.");
  }

  if (!user.isActive) {
    redirect("/stjornbord?error=inactive-user");
  }

  cookieStore.set("activeUserId", String(userId), {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  revalidatePath("/");
  revalidatePath("/stjornbord");
}

export async function clearActiveUser() {
  const { cookies } = await import("next/headers");

  const cookieStore = await cookies();

  cookieStore.delete("activeUserId");

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
  revalidatePath("/stjornbord");

  redirect("/fyrirtaeki");
}
export async function searchCompaniesForUser(
  userId: number,
  query: string
) {
  const search = query.trim();

  if (search.length < 2) {
    return [];
  }

  const currentLinks = await prisma.userCompany.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      companyId: true,
    },
  });

  const connectedCompanyIds = currentLinks.map(
    (link) => link.companyId
  );

  const companies = await prisma.company.findMany({
    where: {
      isActive: true,
      id: {
        notIn: connectedCompanyIds,
      },
      OR: [
        {
          name: {
            contains: search,
          },
        },
        {
          kennitala: {
            contains: search,
          },
        },
      ],
    },
    orderBy: {
      name: "asc",
    },
    take: 10,
    select: {
      id: true,
      name: true,
      kennitala: true,
    },
  });

  return companies;
}
export async function loginUser(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    throw new Error("Netfang og lykilorð vantar.");
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!user || !user.passwordHash) {
    throw new Error("Rangt netfang eða lykilorð.");
  }

  if (!user.isActive) {
    throw new Error("Notandinn er óvirkur.");
  }

  const passwordOk = await bcrypt.compare(password, user.passwordHash);

  if (!passwordOk) {
    throw new Error("Rangt netfang eða lykilorð.");
  }

  const token = crypto.randomBytes(32).toString("hex");

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  const cookieStore = await cookies();

  cookieStore.set("sessionToken", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  redirect("/");
}

export async function logoutUser() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

  if (sessionToken) {
    await prisma.session.deleteMany({
      where: {
        token: sessionToken,
      },
    });
  }

  cookieStore.delete("sessionToken");
  cookieStore.delete("activeCompanyId");
  cookieStore.delete("activeUserId");

  redirect("/innskraning");
}