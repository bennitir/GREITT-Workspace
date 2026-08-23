"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BackNavigationRefresh() {
  const router = useRouter();

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      const navigation =
        performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;

      if (event.persisted || navigation?.type === "back_forward") {
        router.refresh();
      }
    }

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [router]);

  return null;
}