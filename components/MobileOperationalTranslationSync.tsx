"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function MobileOperationalTranslationSync({
  workOrderId,
}: {
  workOrderId?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/mobile/work/translations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        Number.isInteger(workOrderId) ? { workOrderId } : {},
      ),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as null | {
          translatedCount?: number;
        };
      })
      .then((result) => {
        if (cancelled) return;
        if ((result?.translatedCount ?? 0) > 0) {
          router.refresh();
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [router, workOrderId]);

  return null;
}
