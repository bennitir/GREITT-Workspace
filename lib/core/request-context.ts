import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { prisma } from "@/lib/prisma";

function positiveInt(value: string | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Request-scoped auðkennisgrunnur GLÖGGT.
 *
 * React cache() er hér eingöngu notað til að deila sömu niðurstöðu innan
 * eins server request/render. Þetta er EKKI langlíft auth-cache og má því
 * ekki halda gömlum heimildum milli requesta.
 */
export const getRequestAuthContext = cache(async () => {
  const store = await cookies();

  const sessionToken = store.get("sessionToken")?.value;
  const activeUserId = positiveInt(store.get("activeUserId")?.value);
  const activeCompanyId = positiveInt(store.get("activeCompanyId")?.value);
  const postPasswordChangePath =
    store.get("postPasswordChangePath")?.value === "/mobile" ? "/mobile" : "/";

  const session = sessionToken
    ? await prisma.session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      })
    : null;

  const sessionUser =
    session && session.expiresAt > new Date() && session.user.isActive
      ? session.user
      : null;

  let effectiveUser = sessionUser;

  if (sessionUser?.role === "ADMIN" && activeUserId) {
    const impersonated = await prisma.user.findUnique({
      where: { id: activeUserId },
    });

    if (impersonated?.isActive) {
      effectiveUser = impersonated;
    }
  }

  return {
    sessionToken,
    sessionUser,
    effectiveUser,
    activeUserId,
    activeCompanyId,
    postPasswordChangePath,
  };
});

/**
 * Sama UserCompany-röð er oft lesin af layout, require-helper og síðu.
 * Deilum henni innan request en aldrei yfir request-mörk.
 */
export const getRequestUserCompany = cache(async (userId: number, companyId: number) => {
  return prisma.userCompany.findUnique({
    where: {
      userId_companyId: { userId, companyId },
    },
  });
});

/** Persónulegt viðmótstungumál, request-scoped. */
export const getRequestUserInterfaceSettings = cache(async (userId: number) => {
  return prisma.userSettings.findUnique({
    where: { userId },
    select: { interfaceLanguage: true },
  });
});

/** Virkar fyrirtækiseiningar, request-scoped. */
export const getRequestCompanyModuleSettings = cache(async (companyId: number) => {
  return getCompanyModuleSettings(companyId);
});
