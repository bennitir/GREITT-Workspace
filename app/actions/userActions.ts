"use server";

import crypto from "crypto";
import bcrypt from "bcryptjs";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";
import { sendTemporaryPasswordEmail } from "@/lib/email";

async function requireEffectiveAdmin() {
  const user = await getEffectiveUser();

  if (!user || !user.isActive || user.role !== "ADMIN") {
    throw new Error("Þú hefur ekki heimild til þessarar aðgerðar.");
  }

  return user;
}

async function requireRealAdminSession() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

  if (!sessionToken) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  const session = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (
    !session ||
    session.expiresAt <= new Date() ||
    !session.user.isActive ||
    session.user.role !== "ADMIN"
  ) {
    throw new Error("Aðeins ADMIN hefur heimild til þessarar aðgerðar.");
  }

  return session.user;
}

function createTemporaryPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

export async function createUser(formData: FormData) {
  await requireEffectiveAdmin();

  const name = String(formData.get("name") || "").trim();

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();

  const role = String(formData.get("role") || "CLIENT");

  if (!name) {
    throw new Error("Nafn vantar.");
  }

  if (!email) {
    throw new Error("Netfang vantar.");
  }

  const allowedRoles = ["ADMIN", "BOOKKEEPER", "CLIENT"];

  if (!allowedRoles.includes(role)) {
    throw new Error("Ógilt hlutverk.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("Notandi með þetta netfang er þegar skráður.");
  }

  const temporaryPassword = createTemporaryPassword();

  const passwordHash = await bcrypt.hash(
    temporaryPassword,
    12
  );

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
      isActive: true,
      mustChangePassword: true,
    },
  });

  try {
    await sendTemporaryPasswordEmail({
      name,
      email,
      temporaryPassword,
    });
  } catch (error) {
    // Ef aðgangspósturinn kemst ekki af stað fjarlægjum við
    // nýja notandann svo ekki verði til hálfkláraður aðgangur.
    await prisma.user.delete({
      where: { id: user.id },
    });

    throw error;
  }

  revalidatePath("/stjornbord");
  redirect("/stjornbord");
}

export async function setUserActive(
  id: number,
  isActive: boolean
) {
  await requireEffectiveAdmin();

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new Error("Notandi fannst ekki.");
  }

  await prisma.user.update({
    where: { id },
    data: { isActive },
  });

  // Ef notandi er gerður óvirkur lokum við öllum
  // virkum innskráningum hans.
  if (!isActive) {
    await prisma.session.deleteMany({
      where: { userId: id },
    });
  }

  revalidatePath("/stjornbord");
}

export async function addUserCompany(
  userId: number,
  companyId: number,
  accessRole: string = "MANAGER"
) {
  await requireEffectiveAdmin();

  const allowedAccessRoles = [
    "OWNER",
    "MANAGER",
    "BOOKKEEPER",
    "VIEWER",
  ];

  if (!allowedAccessRoles.includes(accessRole)) {
    throw new Error("Ógilt aðgangshlutverk.");
  }

  const [user, company] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
      },
    }),

    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        isActive: true,
      },
    }),
  ]);

  if (!user || !user.isActive) {
    throw new Error(
      "Notandi fannst ekki eða er óvirkur."
    );
  }

  if (!company || !company.isActive) {
    throw new Error(
      "Fyrirtæki fannst ekki eða er óvirkt."
    );
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
  accessRole: string
) {
  await requireEffectiveAdmin();

  const allowedAccessRoles = [
    "OWNER",
    "MANAGER",
    "BOOKKEEPER",
    "VIEWER",
  ];

  if (!allowedAccessRoles.includes(accessRole)) {
    throw new Error("Ógilt aðgangshlutverk.");
  }

  const link = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
  });

  if (!link || !link.isActive) {
    throw new Error(
      "Virk tenging notanda við fyrirtæki fannst ekki."
    );
  }

  await prisma.userCompany.update({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },

    data: {
      accessRole,
    },
  });

  revalidatePath("/stjornbord");
}

export async function removeUserCompany(
  userId: number,
  companyId: number
) {
  await requireEffectiveAdmin();

  const link = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: {
        userId,
        companyId,
      },
    },
  });

  if (!link) {
    throw new Error(
      "Tenging notanda við fyrirtæki fannst ekki."
    );
  }

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
  // Þetta verður viljandi að skoða raunverulega
  // innskráða ADMIN-notandann en ekki effective user.
  await requireRealAdminSession();

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new Error("Notandi fannst ekki.");
  }

  if (!user.isActive) {
    redirect("/stjornbord?error=inactive-user");
  }

  const cookieStore = await cookies();

  cookieStore.set(
    "activeUserId",
    String(userId),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure:
        process.env.NODE_ENV === "production",
    }
  );

  // Fyrirtæki sem ADMIN var áður með virkt má ekki
  // fylgja yfir þegar prófað er sem annar notandi.
  cookieStore.delete("activeCompanyId");

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
  revalidatePath("/stjornbord");

  redirect("/");
}

export async function clearActiveUser() {
  // Raunverulegur ADMIN þarf að mega hætta
  // impersonation þó effective user sé CLIENT.
  await requireRealAdminSession();

  const cookieStore = await cookies();

  cookieStore.delete("activeUserId");
  cookieStore.delete("activeCompanyId");

  revalidatePath("/");
  revalidatePath("/fyrirtaeki");
  revalidatePath("/stjornbord");

  redirect("/fyrirtaeki");
}

export async function searchCompaniesForUser(
  userId: number,
  query: string
) {
  await requireEffectiveAdmin();

  const search = query.trim();

  if (search.length < 2) {
    return [];
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },

    select: {
      id: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    return [];
  }

  const currentLinks =
    await prisma.userCompany.findMany({
      where: {
        userId,
        isActive: true,
      },

      select: {
        companyId: true,
      },
    });

  const connectedCompanyIds =
    currentLinks.map(
      (link) => link.companyId
    );

  const companies =
    await prisma.company.findMany({
      where: {
        isActive: true,

        id: {
          notIn: connectedCompanyIds,
        },

        OR: [
          {
            name: {
              contains: search,
              mode: "insensitive",
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

export async function loginUser(
  formData: FormData
) {
  const email = String(
    formData.get("email") || ""
  )
    .trim()
    .toLowerCase();

  const password = String(
    formData.get("password") || ""
  );

  if (!email || !password) {
    throw new Error(
      "Netfang og lykilorð vantar."
    );
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.passwordHash) {
    throw new Error(
      "Rangt netfang eða lykilorð."
    );
  }

  if (!user.isActive) {
    throw new Error(
      "Notandinn er óvirkur."
    );
  }

  const passwordOk = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!passwordOk) {
    throw new Error(
      "Rangt netfang eða lykilorð."
    );
  }

  const token = crypto
    .randomBytes(32)
    .toString("hex");

  const expiresAt = new Date();

  expiresAt.setDate(
    expiresAt.getDate() + 30
  );

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
    secure:
      process.env.NODE_ENV === "production",
  });

  cookieStore.delete("activeUserId");
  cookieStore.delete("activeCompanyId");

  if (user.mustChangePassword) {
    redirect("/skipta-lykilordi");
  }

  redirect("/");
}

export async function logoutUser() {
  const cookieStore = await cookies();

  const sessionToken =
    cookieStore.get("sessionToken")?.value;

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