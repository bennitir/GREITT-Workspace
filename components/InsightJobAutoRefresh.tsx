"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getInsightJobStatus } from "@/app/actions/insightActions";

type InsightJobAutoRefreshProps = {
  jobId: number;
};

export default function InsightJobAutoRefresh({
  jobId,
}: InsightJobAutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function checkStatus() {
      try {
        const job = await getInsightJobStatus(jobId);

        if (cancelled) {
          return;
        }

        const itemStatus = job.items[0]?.status;

        if (
          itemStatus === "COMPLETED" ||
          itemStatus === "FAILED"
        ) {
          router.refresh();
          return;
        }
      } catch (error) {
        console.error(
          `Ekki tókst að sækja stöðu Innsýn-jobbs ${jobId}:`,
          error,
        );
      }

      if (!cancelled) {
        timer = setTimeout(checkStatus, 3000);
      }
    }

    timer = setTimeout(checkStatus, 3000);

    return () => {
      cancelled = true;

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [jobId, router]);

  return null;
}