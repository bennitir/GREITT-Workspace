import CompanyCreateForm from "@/components/CompanyCreateForm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { adminText } from "@/lib/i18n/admin";

export default async function NyttFyrirtaekiPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;
  const activeUserId = cookieStore.get("activeUserId")?.value;

  const session = sessionToken
    ? await prisma.session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      })
    : null;

  const sessionUser = session && session.expiresAt > new Date() && session.user.isActive ? session.user : null;
  const activeUser = sessionUser?.role === "ADMIN" && activeUserId
    ? await prisma.user.findUnique({ where: { id: Number(activeUserId) } })
    : sessionUser;

  if (!activeUser || activeUser.role !== "ADMIN") redirect("/fyrirtaeki");

  const settings = sessionUser
    ? await prisma.userSettings.findUnique({
        where: { userId: sessionUser.id },
        select: { interfaceLanguage: true },
      })
    : null;
  const language = settings?.interfaceLanguage ?? "is";
  const t = adminText(language);

  return (
    <main className="p-8">
      <h1 className="mb-6 text-3xl font-bold">{t.companyCreate.title}</h1>
      <CompanyCreateForm language={language} />
    </main>
  );
}
