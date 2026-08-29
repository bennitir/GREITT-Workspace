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

  async function handleBook() {
    try {
      setError("");
      setIsLoading(true);
setCanBookAnyway(false);
      await approveDetectedDocument(documentId);

      router.refresh();
   } catch (err) {
  const message =
    err instanceof Error
      ? err.message
      : "Ekki tókst að bóka fylgiskjalið.";

  if (message.startsWith("OLDER_UNBOOKED|")) {
    const [, receiptId, olderDocumentId, olderDate] =
      message.split("|");

   setError(
  `Bókun stöðvuð. Eldra óbókað fylgiskjal er til frá ${formatDate(new Date(olderDate))}.`
);

    setOlderDocumentUrl(
      `/fylgiskjol/${receiptId}?document=${olderDocumentId}`
    );
  } else if (message.startsWith("POSSIBLE_DUPLICATE|")) {
    const [
      ,
      receiptId,
      duplicateDocumentId,
      voucherNumber,
      merchantName,
      totalAmount,
    ] = message.split("|");

    setError(
  `Möguleg tvíbókun: ${merchantName} – ${formatNumber(
    Number(totalAmount)
  )} kr.` +
    (voucherNumber
      ? ` Fannst áður sem fylgiskjal ${voucherNumber}.`
      : " Sambærilegt fylgiskjal fannst áður.")
);
setCanBookAnyway(true);
    setOlderDocumentUrl(
      `/fylgiskjol/${receiptId}?document=${duplicateDocumentId}`
    );
  } else {
    setError(message);
    setOlderDocumentUrl("");
  }
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

                  await approveDetectedDocument(
                    documentId,
                    undefined,
                    true
                  );

                  setCanBookAnyway(false);
                  router.refresh();
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