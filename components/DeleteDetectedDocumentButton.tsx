"use client";

import { useState } from "react";

export default function DeleteDetectedDocumentButton({
  canDelete,
  reviewedAt,
  onDelete,
}: {
  canDelete: boolean;
  reviewedAt: Date | string | null;
  onDelete: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!canDelete) {
  return null;
}

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"
      >
        Eyða þessu greinda fylgiskjali
      </button>
    );
  }

  return (
    <div className="mt-3 rounded border border-red-300 bg-red-50 p-3">
      <p className="font-bold text-red-700">
        ⚠️ Ertu viss um að þú viljir eyða þessu greinda fylgiskjali?
      </p>

      {reviewedAt && (
        <p className="mt-2 font-bold text-red-700">
          Þetta fylgiskjal hefur þegar verið yfirfarið.
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true);
            await onDelete();
          }}
          className="rounded bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {deleting ? "Eyði..." : "Já, eyða"}
        </button>

        <button
          type="button"
          disabled={deleting}
          onClick={() => setConfirming(false)}
          className="rounded border px-4 py-2"
        >
          Hætta við
        </button>
      </div>
    </div>
  );
}