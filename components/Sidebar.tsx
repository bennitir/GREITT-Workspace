"use client";
import { logoutUser } from "@/app/actions/userActions";
import { usePathname } from "next/navigation";
import Link from "next/link";
type Props = {
  activeCompanyName: string | null;
  activeUserRole: string | null;
  activeCompanyRole: string | null;
  enabledModuleIds: string[];
};
export default function Sidebar({
  activeCompanyName,
  activeUserRole,
  activeCompanyRole,
  enabledModuleIds,
}: Props) {
  const pathname = usePathname();
  return (
    <aside className="w-64 h-screen sticky top-0 bg-slate-900 text-white p-6 overflow-y-auto">
      <Link href="/" className="block">
  <h1 className="text-2xl font-bold hover:text-blue-400 transition-colors">
    GLÖGGT
  </h1>

  <p className="text-slate-400 mt-1">
    Workspace
  </p>
</Link>
<Link
  href="/fyrirtaeki"
  className="mt-4 block rounded-lg bg-slate-800 p-3 hover:bg-slate-700 transition-colors"
>
  <p className="text-xs uppercase tracking-wide text-slate-400">
    Virkt fyrirtæki
  </p>




  <p className="mt-1 font-semibold text-white">
  {activeCompanyName ?? "Ekkert valið"}
</p>

{activeCompanyRole && (
  <p className="mt-1 text-sm text-slate-300">
    {activeCompanyRole === "OWNER"
      ? "Eigandi"
      : activeCompanyRole === "MANAGER"
        ? "Stjórnandi"
        : activeCompanyRole === "BOOKKEEPER"
          ? "Bókari"
          : activeCompanyRole === "VIEWER"
            ? "Skoðun"
            : activeCompanyRole}
  </p>
)}

</Link>
{activeUserRole === "ADMIN" ? (
  <Link
    href="/fyrirtaeki/nytt"
    className="mt-6 block rounded-lg bg-blue-600 px-4 py-3 text-center font-medium text-white hover:bg-blue-700 transition-colors"
  >
    ➕ Nýtt fyrirtæki
  </Link>
) : (
  <div className="mt-6 rounded-lg border border-blue-400/30 bg-blue-500/10 p-4">
    <p className="font-semibold text-white">
      ➕ Bæta við fyrirtæki
    </p>

    <p className="mt-2 text-sm leading-5 text-slate-300">
      Ertu með annað félag sem þú vilt hafa í GLÖGGT?
    </p>

    <p className="mt-2 text-sm leading-5 text-blue-300">
      Hafðu samband við GLÖGGT og við aðstoðum þig við að bæta því við.
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
    🛠️ Stjórnstöð
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
  🏠 Heim
</Link>

        <Link
  href="/fyrirtaeki"
  className={`block rounded-lg px-4 py-3 transition-colors ${
    pathname.startsWith("/fyrirtaeki")
      ? "bg-blue-600 text-white"
      : "text-slate-300 hover:bg-slate-800"
  }`}
>
  🏢 Fyrirtæki
</Link>

{enabledModuleIds.includes("sala") && (
  <Link
    href="/sala"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/sala") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    🧾 Sala
  </Link>
)}

{enabledModuleIds.includes("laun") && (
  <Link
    href="/laun"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/laun") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    💰 Laun
  </Link>
)}

{enabledModuleIds.includes("birgdir") && (
  <Link
    href="/birgdir"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/birgdir") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    📦 Birgðir
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
📄 Óunnin fylgiskjöl
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
    📚 Bókuð fylgiskjöl
  </Link>
)}

{enabledModuleIds.includes("bokhald") && (

<Link
  href="/banki"
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
>
  🏦 Banki
</Link>
)}

{enabledModuleIds.includes("bokhald") && (

<Link
  href="/vsk"
  className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/vsk") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
>
  🧾 VSK og skil
</Link>

)}

<Link
  href="/innsyn"
  className="block rounded-lg px-4 py-3 text-slate-300 hover:bg-slate-800"
>
  📊 Innsýn
</Link>

{enabledModuleIds.includes("vinnustundir") && (
  <Link
    href="/vinnustundir"
    className={`block rounded-lg px-4 py-3 transition-colors ${pathname.startsWith("/vinnustundir") ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
  >
    ⏱ Vinnustundir
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
    🔧 Verk
  </Link>
)}

      </nav>

      <form action={logoutUser} className="mt-auto pt-6">
  <button
    type="submit"
    className="w-full rounded-lg px-4 py-3 text-left text-slate-300 hover:bg-slate-800 hover:text-white"
  >
    🚪 Skrá út
  </button>
</form>
    </aside>
  );


}
