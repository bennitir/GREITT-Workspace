"use client";

import { usePathname } from "next/navigation";

type MobileAwareShellProps = {
  sidebar: React.ReactNode;
  topClock: React.ReactNode;
  children: React.ReactNode;
};

export default function MobileAwareShell({
  sidebar,
  topClock,
  children,
}: MobileAwareShellProps) {
  const pathname = usePathname();
  const isMobile = pathname.startsWith("/mobile");

  if (isMobile) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {sidebar}

      <main className="flex-1">
        {topClock}
        {children}
      </main>
    </div>
  );
}