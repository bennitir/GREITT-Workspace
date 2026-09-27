"use client";

import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { approveDetectedDocument } from "@/app/actions/receiptActions";

export default function ApproveDocumentButton({
  documentId,
}: {
  documentId: number;
}) {
  const router = useRouter();

  const [error, setError] = useState("");
const [olderDocumentUrl, setOlderDocumentUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [canBookAnyway, setCanBookAnyway] = useState(false);

  function applyBookingResult(
    result: Awaited<ReturnType<typeof approveDetectedDocument>>
  ) {
    if (result.status === "BOOKED") {
      setError("");
      setOlderDocumentUrl("");
      setCanBookAnyway(false);
      return true;
    }

    if (result.status === "OLDER_UNBOOKED") {
      setError(
        `Bókun stöðvuð. Eldra óbókað fylgiskjal er til frá ${formatDate(
          new Date(result.date)
        )}.`
      );
      setOlderDocumentUrl(
        `/fylgiskjol/${result.receiptId}?document=${result.documentId}`
      );
      setCanBookAnyway(false);
      return false;
    }

    setError(
      `Möguleg tvíbókun: ${result.merchantName} – ${formatNumber(
        result.totalAmount
      )} kr.` +
        (result.voucherNumber
          ? ` Fannst áður sem fylgiskjal ${result.voucherNumber}.`
          : " Sambærilegt fylgiskjal fannst áður.")
    );
    setOlderDocumentUrl(
      `/fylgiskjol/${result.receiptId}?document=${result.documentId}`
    );
    setCanBookAnyway(true);
    return false;
  }

  async function handleBook() {
    try {
      setError("");
      setIsLoading(true);
      setCanBookAnyway(false);

      const result = await approveDetectedDocument(documentId);

      if (applyBookingResult(result)) {
        router.refresh();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ekki tókst að bóka fylgiskjalið."
      );
      setOlderDocumentUrl("");
      setCanBookAnyway(false);
    } finally {
      setIsLoading(false);
    }
  }

  return (
  <div className="mt-3">
    <button
      type="button"
      onClick={handleBook}
      disabled={isLoading}
      className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
    >
      {isLoading ? "Bóka..." : "Bóka fylgiskjal"}
    </button>

    {error && (
      <div className="mt-3 rounded border border-yellow-300 bg-yellow-50 p-3 text-yellow-800">
        <div>⚠ {error}</div>

        <div className="mt-3 flex flex-wrap gap-2">
          {olderDocumentUrl && (
            <a
              href={olderDocumentUrl}
              className="inline-block rounded bg-yellow-700 px-3 py-2 text-white"
            >
              Opna eldra fylgiskjal
            </a>
          )}

          {canBookAnyway && (
            <button
              type="button"
              disabled={isLoading}
              onClick={async () => {
                try {
                  setError("");
                  setIsLoading(true);

                  const result = await approveDetectedDocument(
                    documentId,
                    undefined,
                    true
                  );

                  if (applyBookingResult(result)) {
                    router.refresh();
                  }
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Ekki tókst að bóka fylgiskjalið."
                  );
                } finally {
                  setIsLoading(false);
                }
              }}
              className="rounded bg-orange-700 px-3 py-2 text-white disabled:opacity-50"
            >
              Bóka samt
            </button>
          )}
        </div>
      </div>
    )}
  </div>
    );
}