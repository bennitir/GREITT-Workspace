import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { adminText } from "@/lib/i18n/admin";

export default async function StjornbordLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const session = token
    ? await prisma.session.findUnique({ where: { token }, include: { user: true } })
    : null;

  const isAdmin = !!session && session.expiresAt > new Date() && session.user.isActive && session.user.role === "ADMIN";

  if (!isAdmin) return <>{children}</>;

  const settings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });
  const t = adminText(settings?.interfaceLanguage);

  return (
    <div>
      <div className="sticky top-0 z-30 border-b bg-white/95 px-6 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-bold text-slate-500">{t.nav.admin}</span>
          <Link href="/stjornbord" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">{t.nav.overview}</Link>
          <Link href="/stjornbord/fyrirtaeki" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">{t.nav.companies}</Link>
          <Link href="/stjornbord/notendur" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">{t.nav.users}</Link>
          <Link href="/stjornbord/kerfisstillingar" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">{t.nav.systemSettings}</Link>
          <Link href="/stjornbord/abendingar" className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">{t.nav.suggestions}</Link>
        </div>
      </div>
      {children}
    </div>
  );
}
