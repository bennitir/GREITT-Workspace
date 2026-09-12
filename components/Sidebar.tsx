"use client";
import { logoutUser } from "@/app/actions/userActions";
import { usePathname } from "next/navigation";
import Link from "next/link";
import ServiceTimeTracker from "@/components/ServiceTimeTracker";
import { uiText } from "@/lib/i18n/ui";
type Props = {
  activeCompanyName: string | null;
  activeUserRole: string | null;
  activeCompanyRole: string | null;
  enabledModuleIds: string[];
  interfaceLanguage?: string;
};
export default function Sidebar({
  activeCompanyName,
  activeUserRole,
  activeCompanyRole,
  enabledModuleIds,
  interfaceLanguage,
}: Props) {
  const pathname = usePathname();
  const t = uiText(interfaceLanguage);
  return (
    <aside className="w-64 h-screen sticky top-0 bg-slate-900 text-white p-6 overflow-y-auto">
      <Link href="/" className="block">
  <h1 className="text-2xl font-bold hover:text-blue-400 transition-colors">
    GLÖGGT
  </h1>

  <p className="text-slate-400 mt-1">
    {t.solutions}
  </p>
</Link>
<Link
  href="/fyrirtaeki"
  className="mt-4 block rounded-lg bg-slate-800 p-3 hover:bg-slate-700 transition-colors"
>
  <p className="text-xs uppercase tracking-wide text-slate-400">
    {t.activeCompany}
  </p>




  <p className="mt-1 font-semibold text-white">
  {activeCompanyName ?? t.noneSelected}
</p>

{activeCompanyRole && (
  <p className="mt-1 text-sm text-slate-300">
    {activeCompanyRole === "OWNER"
      ? t.owner
      : activeCompanyRole === "MANAGER"
        ? t.manager
        : activeCompanyRole === "BOOKKEEPER"
          ? t.bookkeeper
          : activeCompanyRole === "VIEWER"
            ? t.viewer
            : activeCompanyRole}
  </p>
)}

</Link>
{activeUserRole === "ADMIN" ? (
  <Link
    href="/fyrirtaeki/nytt"
    className="mt-6 block rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white hover:bg-blue-700 transition-colors"
  >
    {t.newCompany}
  </Link>
) : (
  <div className="mt-6 rounded-lg border border-blue-400/30 bg-blue-500/10 p-4">
    <p className="font-semibold text-white">
      {t.addCompany}
    </p>

    <p className="mt-2 text-sm leading-5 text-slate-300">
      {t.addCompanyText}
    </p>

    <p className="mt-2 text-sm leading-5 text-blue-300">
      {t.contactGloggt}
    </p>
  </div>
)}

      <nav className="mt-10 space-y-3">

        {activeUserRole === "ADMIN" && (
  <Link
    href="/stjornbord"
    className={`block rounded-lg px-4 py-3 transition-colors ${
      pathname.startsWith("/stjornbord")
        ? "bg-blue-600 text-white"
        : "text-slate-300 hover:bg-slate-800"
    }`}
  >
    {t.admin}
  </Link>
)}
        <Link
  href="/"
  className={`block rounded-lg px-4 py-3 transition-colors ${
    pathname === "/"
      ? "bg-blue-600 text-white"
      : "text-slate-300 hover:bg-slate-800"
  }`}
>
  {t.home}
</Link>

        <Link
  href="/fyrirtaeki"
  className={`block rounded-lg px-4 py-3 transition-colors ${
    pathname.startsWith("/fyrirtaeki")
      ? "bg-blue-600 text-white"
      : "text-slate-300 hover:bg-slate-800"
  }`}
>
  {t.companies}
</Link>

{enabledModuleIds.includes("sala") && (
  <Link
    href="/sala"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/sala") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    {t.sales}
  </Link>
)}

{enabledModuleIds.includes("laun") && (
  <Link
    href="/laun"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/laun") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    {t.payroll}
  </Link>
)}

{enabledModuleIds.includes("birgdir") && (
  <Link
    href="/birgdir"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/birgdir") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    {t.inventory}
  </Link>
)}

{enabledModuleIds.includes("bokhald") && (

        <Link
  href="/fylgiskjol"
  className={`block rounded-lg px-4 py-3 transition-colors ${
    pathname.startsWith("/fylgiskjol")
      ? "bg-blue-600 text-white"
      : "text-slate-300 hover:bg-slate-800"
  }`}
>
{t.pendingDocs}
</Link>
)}

{enabledModuleIds.includes("bokhald") && (
  <Link
    href="/fylgiskjol/bokud"
    className={`block rounded-lg px-4 py-3 transition-colors ${
      pathname.startsWith("/fylgiskjol/bokud")
        ? "bg-blue-600 text-white"
        : "text-slate-300 hover:bg-slate-800"
    }`}
  >
    {t.bookedDocs}
  </Link>
)}

{enabledModuleIds.includes("bokhald") && (

<Link
  href="/banki"
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
>
  {t.bank}
</Link>
)}

{enabledModuleIds.includes("bokhald") && (

<Link
  href="/vsk"
  className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/vsk") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
>
  {t.vat}
</Link>

)}

<Link
  href="/innsyn"
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
>
  {t.insights}
</Link>

{enabledModuleIds.includes("vinnustundir") && (
  <Link
    href="/vinnustundir"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/vinnustundir") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    {t.hours}
  </Link>
)}

  {enabledModuleIds.includes("verk") && (
  <Link
    href="/verk"
    className={`block rounded-lg px-4 py-3 transition-colors ${
      pathname.startsWith("/verk")
        ? "bg-blue-600 text-white"
        : "text-slate-300 hover:bg-slate-800"
    }`}
  >
    {t.work}
  </Link>
)}

        <Link
          href="/stillingar"
          className={`block rounded-lg px-4 py-3 transition-colors ${
            pathname.startsWith("/stillingar")
              ? "bg-blue-600 text-white"
              : "text-slate-300 hover:bg-slate-800"
          }`}
        >
          {t.mySettings}
        </Link>

      </nav>

      <ServiceTimeTracker />
      <form action={logoutUser} className="mt-auto pt-6">
  <button
    type="submit"
    className="w-full rounded-lg px-4 py-3 text-left text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    {t.logout}
  </button>
</form>
    </aside>
  );


}
