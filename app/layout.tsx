import MobileAwareShell from "@/components/MobileAwareShell";
import BackNavigationRefresh from "@/components/BackNavigationRefresh";
import TopClock from "@/components/TopClock";
import Sidebar from "@/components/Sidebar";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import {
  getCompanyModuleSettings,
} from "@/lib/core/company-module-repository";

import {
  getEnabledCompanyModules,
} from "@/lib/core/company-modules";

import {
  clearActiveUser,
} from "@/app/actions/userActions";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GLÖGGT",
  description: "GLÖGGT",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const pathname =
    headerStore.get("x-gloggt-pathname") ?? "/";

  const sessionToken =
    cookieStore.get("sessionToken")?.value;

  const session = sessionToken
    ? await prisma.session.findUnique({
        where: {
          token: sessionToken,
        },
        include: {
          user: true,
        },
      })
    : null;

  const sessionUser =
    session &&
    session.expiresAt > new Date() &&
    session.user.isActive
      ? session.user
      : null;

  /*
    Ef session-cookie er til en sessionið sjálft er
    útrunnið, ógilt eða notandinn orðinn óvirkur,
    má viðkomandi ekki halda áfram inn í kerfið.
  */
  if (
    sessionToken &&
    !sessionUser &&
    pathname !== "/innskraning"
  ) {
    redirect("/innskraning");
  }

  /*
    Skyldubreyting lykilorðs.

    Notandinn má ekki komast inn á aðrar síður GLÖGGT
    meðan mustChangePassword = true.

    /skipta-lykilordi er undantekningin svo við
    búum ekki til redirect-lykkju.
  */
  if (
    sessionUser?.mustChangePassword &&
    pathname !== "/skipta-lykilordi"
  ) {
    redirect("/skipta-lykilordi");
  }

  /*
    Ef lykilorðaskiptum er þegar lokið má notandinn
    ekki fara aftur á skyldubreytingarsíðuna.
  */
  if (
    sessionUser &&
    !sessionUser.mustChangePassword &&
    pathname === "/skipta-lykilordi"
  ) {
    redirect("/");
  }

  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

  const activeUserId =
    cookieStore.get("activeUserId")?.value;

  /*
    activeUserId er aðeins virt þegar raunverulega
    innskráði notandinn er ADMIN.
  */
  const activeUser =
    sessionUser?.role === "ADMIN" && activeUserId
      ? await prisma.user.findUnique({
          where: {
            id: Number(activeUserId),
          },
          select: {
            id: true,
            role: true,
            isActive: true,
          },
        })
      : sessionUser;

  /*
    Óvirkur impersonated notandi má ekki teljast
    virkur notandi.
  */
  const effectiveActiveUser =
    activeUser?.isActive
      ? activeUser
      : sessionUser;

  const activeCompany =
    activeCompanyId && effectiveActiveUser
      ? await prisma.company.findFirst({
          where: {
            id: Number(activeCompanyId),

            ...(effectiveActiveUser.role !== "ADMIN"
              ? {
                  users: {
                    some: {
                      userId: effectiveActiveUser.id,
                      isActive: true,
                    },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            name: true,
          },
        })
      : null;

  const activeCompanyAccess =
    activeCompany &&
    effectiveActiveUser &&
    effectiveActiveUser.role !== "ADMIN"
      ? await prisma.userCompany.findUnique({
          where: {
            userId_companyId: {
              userId: effectiveActiveUser.id,
              companyId: activeCompany.id,
            },
          },
          select: {
            accessRole: true,
            isActive: true,
          },
        })
      : null;

  const moduleSettings = activeCompany
    ? await getCompanyModuleSettings(activeCompany.id)
    : {};

  const enabledModuleIds =
    getEnabledCompanyModules(moduleSettings).map(
      (module) => module.id
    );

  /*
    Innskráning og skyldubreyting lykilorðs eiga
    ekki að sýna Sidebar eða bókhaldsviðmótið.
  */
  const plainPage =
  !sessionUser ||
  pathname === "/innskraning" ||
  pathname === "/skipta-lykilordi" ||
  pathname.startsWith("/mobile");

  return (
    <html
      lang="is"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <BackNavigationRefresh />

        {plainPage ? (
          children
        ) : (
          <MobileAwareShell
            sidebar={
              <Sidebar
                activeCompanyName={
                  activeCompany?.name ?? null
                }
                activeUserRole={
                  effectiveActiveUser?.role ??
                  sessionUser.role
                }
                activeCompanyRole={
                  activeCompanyAccess?.isActive
                    ? activeCompanyAccess.accessRole
                    : null
                }
                enabledModuleIds={enabledModuleIds}
              />
            }
            topClock={<TopClock />}
          >
            {activeUserId &&
              sessionUser.role === "ADMIN" && (
                <form
                  action={clearActiveUser}
                  className="fixed right-4 top-4 z-50"
                >
                  <button
                    type="submit"
                    className="rounded bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow hover:bg-slate-900"
                  >
                    Til baka í admin
                  </button>
                </form>
              )}

            {children}
          </MobileAwareShell>
        )}
      </body>
    </html>
  );
}