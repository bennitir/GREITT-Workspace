import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import MobileAwareShell from "@/components/MobileAwareShell";
import BackNavigationRefresh from "@/components/BackNavigationRefresh";
import TopClock from "@/components/TopClock";
import Sidebar from "@/components/Sidebar";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

import {
  getEnabledCompanyModules,
} from "@/lib/core/company-modules";

import {
  getRequestAuthContext,
  getRequestCompanyModuleSettings,
  getRequestUserCompany,
  getRequestUserInterfaceSettings,
} from "@/lib/core/request-context";

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
  const headerStore = await headers();
  const requestContext = await getRequestAuthContext();

  const pathname =
    headerStore.get("x-gloggt-pathname") ?? "/";

  const {
    sessionToken,
    sessionUser,
    effectiveUser: effectiveActiveUser,
    activeCompanyId,
    activeUserId,
    postPasswordChangePath,
  } = requestContext;

  const publicAuthPage =
    pathname === "/innskraning" ||
    pathname === "/gleymt-lykilord" ||
    pathname === "/endurstilla-lykilord";

  /*
    Ef session-cookie er til en sessionið sjálft er
    útrunnið, ógilt eða notandinn orðinn óvirkur,
    má viðkomandi ekki halda áfram inn í kerfið.
  */
  if (sessionToken && !sessionUser && !publicAuthPage) {
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
    redirect(postPasswordChangePath);
  }

  const activeCompany =
    activeCompanyId && effectiveActiveUser
      ? await prisma.company.findFirst({
          where: {
            id: activeCompanyId,

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
      ? await getRequestUserCompany(effectiveActiveUser.id, activeCompany.id)
      : null;

  const canManageCompany = Boolean(
    activeCompany &&
      effectiveActiveUser &&
      (effectiveActiveUser.role === "ADMIN" ||
        (activeCompanyAccess?.isActive &&
          (activeCompanyAccess.accessRole === "OWNER" ||
            activeCompanyAccess.accessRole === "MANAGER" ||
            activeCompanyAccess.canManageCompanySettings))),
  );

  const userSettings = effectiveActiveUser
    ? await getRequestUserInterfaceSettings(effectiveActiveUser.id)
    : null;

  const moduleSettings = activeCompany
    ? await getRequestCompanyModuleSettings(activeCompany.id)
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
  publicAuthPage ||
  pathname === "/skipta-lykilordi" ||
  pathname.startsWith("/mobile");

  return (
    <html
      lang={userSettings?.interfaceLanguage ?? "is"}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
  <ServiceWorkerRegister />
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
                canManageCompany={canManageCompany}
                interfaceLanguage={userSettings?.interfaceLanguage ?? "is"}
              />
            }
            topClock={<TopClock interfaceLanguage={userSettings?.interfaceLanguage ?? "is"} />}
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