"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { logoutUser } from "@/app/actions/userActions";
import ServiceTimeTracker from "@/components/ServiceTimeTracker";
import { navigationText } from "@/lib/i18n/navigation";
import { uiText } from "@/lib/i18n/ui";

type Props = {
  activeCompanyName: string | null;
  activeUserRole: string | null;
  activeCompanyRole: string | null;
  enabledModuleIds: string[];
  canManageCompany: boolean;
  interfaceLanguage?: string;
};

type WorkspaceId =
  | "home"
  | "accounting"
  | "sales"
  | "payroll"
  | "inventory"
  | "hours"
  | "work"
  | "insights"
  | "management"
  | "admin";

type WorkspaceLink = {
  id: WorkspaceId;
  href: string;
  icon: string;
  visible: boolean;
};

type ContextLink = {
  kind: "link";
  href: string;
  label: string;
  icon: string;
  exact?: boolean;
  workView?: "schedule" | "bank" | "map";
};

type ContextSection = {
  kind: "section";
  label: string;
};

type ContextItem = ContextLink | ContextSection;

function activeWorkspace(pathname: string): WorkspaceId {
  if (pathname.startsWith("/stjornbord")) return "admin";
  if (pathname.startsWith("/stjornun")) return "management";
  if (pathname.startsWith("/verk")) return "work";
  if (pathname.startsWith("/birgdir")) return "inventory";
  if (pathname.startsWith("/sala")) return "sales";
  if (pathname.startsWith("/laun")) return "payroll";
  if (pathname.startsWith("/vinnustundir") || pathname.startsWith("/starfsmenn")) return "hours";
  if (pathname.startsWith("/innsyn")) return "insights";
  if (
    pathname.startsWith("/fylgiskjol") ||
    pathname.startsWith("/banki") ||
    pathname.startsWith("/vsk") ||
    pathname.startsWith("/innflutningur")
  ) return "accounting";
  return "home";
}

function isLinkActive(pathname: string, currentWorkView: string, link: ContextLink) {
  if (link.workView) {
    return pathname === "/verk" && currentWorkView === link.workView;
  }
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}

function roleText(role: string | null, t: ReturnType<typeof uiText>) {
  if (!role) return null;
  if (role === "OWNER") return t.owner;
  if (role === "MANAGER") return t.manager;
  if (role === "BOOKKEEPER") return t.bookkeeper;
  if (role === "VIEWER") return t.viewer;
  return role;
}

export default function Sidebar({
  activeCompanyName,
  activeUserRole,
  activeCompanyRole,
  enabledModuleIds,
  canManageCompany,
  interfaceLanguage,
}: Props) {
  const pathname = usePathname();
  const t = uiText(interfaceLanguage);
  const n = navigationText(interfaceLanguage);
  const workspace = activeWorkspace(pathname);
  const hasCompany = Boolean(activeCompanyName);
  const enabled = new Set(enabledModuleIds);
  const [currentWorkView, setCurrentWorkView] = useState("schedule");

  useEffect(() => {
    const syncWorkView = () => {
      if (window.location.hash === "#verkabanki") setCurrentWorkView("bank");
      else if (window.location.hash === "#kort") setCurrentWorkView("map");
      else setCurrentWorkView("schedule");
    };
    syncWorkView();
    window.addEventListener("hashchange", syncWorkView);
    return () => window.removeEventListener("hashchange", syncWorkView);
  }, [pathname]);

  const workspaces: WorkspaceLink[] = [
    { id: "home", href: "/", icon: "⌂", visible: true },
    { id: "accounting", href: "/fylgiskjol", icon: "▤", visible: hasCompany && enabled.has("bokhald") },
    { id: "work", href: "/verk", icon: "⌘", visible: hasCompany && enabled.has("verk") },
    { id: "hours", href: "/vinnustundir", icon: "◷", visible: hasCompany && enabled.has("vinnustundir") },
    { id: "sales", href: "/sala", icon: "◇", visible: hasCompany && enabled.has("sala") },
    { id: "inventory", href: "/birgdir", icon: "▣", visible: hasCompany && enabled.has("birgdir") },
    { id: "payroll", href: "/laun", icon: "₭", visible: hasCompany && enabled.has("laun") },
    { id: "insights", href: "/innsyn", icon: "⌁", visible: hasCompany },
    { id: "management", href: "/stjornun", icon: "⚙", visible: hasCompany && canManageCompany },
    { id: "admin", href: "/stjornbord", icon: "◆", visible: activeUserRole === "ADMIN" },
  ];

  const contextLinks: Record<WorkspaceId, ContextItem[]> = {
    home: [
      { kind: "link", href: "/", label: n.links.home, icon: "⌂", exact: true },
      { kind: "link", href: "/fyrirtaeki", label: n.links.companies, icon: "▦" },
      { kind: "link", href: "/verkefni", label: n.links.tasks, icon: "✓" },
      { kind: "link", href: "/skilabod", label: n.links.messages, icon: "✉" },
    ],
    accounting: [
      { kind: "link", href: "/fylgiskjol", label: n.links.pendingDocuments, icon: "▤", exact: true },
      { kind: "link", href: "/fylgiskjol/skjalasafn", label: n.links.archive, icon: "▥" },
      { kind: "link", href: "/banki", label: n.links.bank, icon: "▰" },
      { kind: "link", href: "/vsk", label: n.links.vat, icon: "%" },
    ],
    work: [
      { kind: "link", href: "/verk#dagskipulag", label: n.links.workSchedule, icon: "▦", workView: "schedule" },
      { kind: "link", href: "/verk#verkabanki", label: n.links.workBank, icon: "☷", workView: "bank" },
      { kind: "link", href: "/verk#kort", label: n.links.workMap, icon: "⌖", workView: "map" },
      { kind: "link", href: "/verk/tilfong", label: n.links.equipment, icon: "⌘" },
      { kind: "section", label: n.sections.workSettings },
      { kind: "link", href: "/verk/lyklar", label: n.links.workKeys, icon: "#" },
      { kind: "link", href: "/verk/vinnutimi", label: n.links.workTime, icon: "◷" },
    ],
    inventory: [
      { kind: "link", href: "/birgdir", label: n.links.inventory, icon: "▣", exact: true },
      { kind: "link", href: "/birgdir/vorutalningar", label: n.links.stocktakes, icon: "☷" },
    ],
    sales: [{ kind: "link", href: "/sala", label: n.links.sales, icon: "◇", exact: true }],
    payroll: [{ kind: "link", href: "/laun", label: n.links.payroll, icon: "₭", exact: true }],
    hours: [
      { kind: "link", href: "/vinnustundir", label: n.links.hours, icon: "◷", exact: true },
      { kind: "link", href: "/starfsmenn", label: n.links.employees, icon: "♙" },
    ],
    insights: [{ kind: "link", href: "/innsyn", label: n.links.insights, icon: "⌁", exact: true }],
    management: [{ kind: "link", href: "/stjornun", label: n.links.management, icon: "⚙", exact: true }],
    admin: [
      { kind: "link", href: "/stjornbord", label: n.links.adminOverview, icon: "◆", exact: true },
      { kind: "link", href: "/stjornbord/fyrirtaeki", label: n.links.adminCompanies, icon: "▦" },
      { kind: "link", href: "/stjornbord/notendur", label: n.links.adminUsers, icon: "♙" },
      { kind: "link", href: "/stjornbord/kerfisstillingar", label: n.links.adminSettings, icon: "⚙" },
      { kind: "link", href: "/stjornbord/kostnadur", label: n.links.adminCost, icon: "₭" },
      { kind: "link", href: "/stjornbord/abendingar", label: n.links.adminSuggestions, icon: "!" },
    ],
  };

  const currentWorkspaceLabel = n.workspaces[workspace];
  const currentRole = roleText(activeCompanyRole, t);

  const switchWorkView = (view: "schedule" | "bank" | "map") => {
    const hash = view === "bank" ? "#verkabanki" : view === "map" ? "#kort" : "#dagskipulag";
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.pushState(null, "", nextUrl);
    window.dispatchEvent(new Event("hashchange"));
  };

  return (
    <aside className="sticky top-0 z-40 flex h-screen shrink-0 overflow-x-hidden text-white">
      <div className="flex w-[58px] shrink-0 flex-col overflow-x-hidden border-r border-slate-800 bg-slate-950">
        <Link href="/" className="flex h-[64px] items-center justify-center border-b border-slate-800 text-base font-black tracking-tight text-white" title="GLÖGGT">
          G
        </Link>

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-1.5 py-2">
          {workspaces.filter((item) => item.visible).map((item) => {
            const active = workspace === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                title={n.workspaces[item.id]}
                aria-label={n.workspaces[item.id]}
                className={`flex h-11 w-full items-center justify-center rounded-xl text-center transition ${
                  active ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-1.5">
          <Link
            href="/stillingar"
            title={n.links.mySettings}
            aria-label={n.links.mySettings}
            className={`flex h-11 w-full items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-900 hover:text-white ${pathname.startsWith("/stillingar") ? "bg-slate-800 text-white" : ""}`}
          >
            <span className="text-lg">⚙</span>
          </Link>
        </div>
      </div>

      <div className="flex w-[208px] shrink-0 flex-col bg-slate-900">
        <div className="border-b border-slate-800 px-3.5 py-3.5">
          <Link href="/" className="block text-lg font-black tracking-tight text-white hover:text-blue-300">GLÖGGT</Link>
          <p className="mt-0.5 text-[10px] text-slate-400">{t.solutions}</p>
        </div>

        <div className="border-b border-slate-800 p-2.5">
          <Link href="/fyrirtaeki" className="block rounded-xl border border-slate-700 bg-slate-800/80 p-2.5 transition hover:border-slate-600 hover:bg-slate-800">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{n.company.label}</p>
            <p className="mt-1 truncate text-xs font-bold text-white">{activeCompanyName ?? n.company.noCompany}</p>
            <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-slate-400">
              <span className="truncate">{currentRole ? `${n.company.role}: ${currentRole}` : n.company.switch}</span>
              <span aria-hidden>↗</span>
            </div>
          </Link>
        </div>

        <div className="border-b border-slate-800 px-3.5 py-2.5">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-blue-400">{n.workspaceHint}</p>
          <h2 className="mt-1 text-base font-bold text-white">{currentWorkspaceLabel}</h2>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2.5">
          {contextLinks[workspace].map((item, index) => {
            if (item.kind === "section") {
              return (
                <p key={`${item.label}-${index}`} className="mb-1 mt-4 px-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  {item.label}
                </p>
              );
            }
            const active = isLinkActive(pathname, currentWorkView, item);
            const className = `mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold transition ${
              active ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`;

            if (item.workView && pathname === "/verk") {
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => switchWorkView(item.workView!)}
                  className={className}
                >
                  <span className="w-4 shrink-0 text-center text-xs text-slate-400">{item.icon}</span>
                  <span className="min-w-0 truncate">{item.label}</span>
                </button>
              );
            }

            return (
              <Link key={item.href} href={item.href} className={className}>
                <span className="w-4 shrink-0 text-center text-xs text-slate-400">{item.icon}</span>
                <span className="min-w-0 truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 p-2.5">
          <ServiceTimeTracker interfaceLanguage={interfaceLanguage} />
          <form action={logoutUser} className="mt-1.5">
            <button type="submit" className="w-full rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-400 transition hover:bg-slate-800 hover:text-white">
              {n.links.logout}
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
