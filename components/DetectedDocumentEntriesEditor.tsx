"use client";
import ApproveDocumentButton from "@/components/ApproveDocumentButton";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  updateDetectedDocumentEntries,
  addDetectedDocumentEntry,
  deleteDetectedDocumentEntry,
  markDetectedDocumentDuplicate,
} from "@/app/actions/receiptActions";

type Entry = {
  id: number;
  account: string;
  text: string;
  debit: number;
  credit: number;
};

type Props = {
  documentId: number;
  entries: Entry[];
  date: Date | string | null;
  totalAmount: number | null;
  reviewedAt: Date | string | null;
  approvedAt: Date | string | null;
  voucherNumber: number | null;
  duplicateOfDocumentId: number | null;
duplicateVoucherNumber: number | null;
duplicateMarkedAt: Date | null;
canBook: boolean;
canEdit: boolean;
};

export default function DetectedDocumentEntriesEditor({
  documentId,
  entries,
  date,
  totalAmount,
  reviewedAt,
  approvedAt,
    voucherNumber,
    duplicateOfDocumentId,
duplicateVoucherNumber,
duplicateMarkedAt,
canBook,
canEdit,
}: Props) {
  const router = useRouter();

  const [rows, setRows] = useState(entries);
  useEffect(() => {
  setRows(entries);
}, [entries]);0

  const [documentDate, setDocumentDate] = useState(
  date
    ? new Date(date).toISOString().slice(0, 10)
    : ""
);

const [dateInputValue, setDateInputValue] = useState(
  date
    ? new Date(date).toISOString().slice(0, 10).split("-").reverse().join(".")
    : ""
);

const [documentAmount, setDocumentAmount] = useState(
  totalAmount != null ? String(totalAmount) : ""
);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  function updateRow(
    id: number,
    field: keyof Entry,
    value: string
  ) {
    setHasUnsavedChanges(true);
    setRows((current) =>
      current.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                field === "debit" ||
                field === "credit"
                  ? Number(value)
                  : value,
            }
          : row
      )
    );

    setMessage("");
    setError("");
  }

  const totalDebit = rows.reduce(
    (sum, row) => sum + row.debit,
    0
  );

  const totalCredit = rows.reduce(
    (sum, row) => sum + row.credit,
    0
  );

 const balances =
  rows.length > 0 &&
  totalDebit > 0 &&
  totalCredit > 0 &&
  Math.abs(totalDebit - totalCredit) <= 0.01;
  async function handleSave() {
    try {
      setSaving(true);
      setMessage("");
      setError("");

     await updateDetectedDocumentEntries(
  documentId,
  rows,
  documentDate,
  documentAmount
);

      setMessage("Breytingar vistaðar.");
      setHasUnsavedChanges(false);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Villa kom upp við vistun breytinga."
      );
    } finally {
      setSaving(false);
    }
  }

async function handleMarkDuplicate() {
  try {
    setError("");
    setMessage("");

    if (!duplicateOfDocumentId || !duplicateVoucherNumber) {
      setError("Vantar upplýsingar um hvaða bókaða fylgiskjal þetta er tvírit af.");
      return;
    }

    await markDetectedDocumentDuplicate(
      documentId,
      duplicateOfDocumentId,
      duplicateVoucherNumber
    );

    setMessage(
      `Tvírit merkt – þegar bókað sem fylgiskjal ${duplicateVoucherNumber}.`
    );

    router.refresh();
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Ekki tókst að merkja fylgiskjalið sem tvírit."
    );
  }
}

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-3">
  <label className="text-sm">
    <span className="mb-1 block font-semibold">Dagsetning</span>
    <input
  type="text"
  value={dateInputValue}
disabled={!canEdit}
  onChange={(e) => {
  const value = e.target.value;

  setDateInputValue(value);
  setHasUnsavedChanges(true);

  const match = value.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
  );

  if (match) {
    const [, day, month, year] = match;

    setDocumentDate(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
    );
  }
}}
  placeholder="dd.mm.áááá"
  className="w-full rounded border px-2 py-1"
/>
  </label>

  <label className="text-sm">
    <span className="mb-1 block font-semibold">Upphæð</span>
    <input
      type="number"
      value={documentAmount}
      disabled={!canEdit}
      onChange={(e) => {
  setDocumentAmount(e.target.value);
  setHasUnsavedChanges(true);
}}
      className="w-full rounded border px-2 py-1"
      placeholder="Upphæð"
    />
  </label>
</div>
<div className="grid grid-cols-4 gap-2 text-xs font-semibold text-slate-500">
        <span>Reikningslykill</span>
        <span>Texti</span>
        <span>Debet</span>
        <span>Kredit</span>
      </div>

      {rows.map((entry) => (
        <div
          key={entry.id}
          className="grid grid-cols-5 gap-2 border-t py-3 text-sm"
        >
          <input
            value={entry.account}
            disabled={!canEdit}
            onChange={(e) =>
              updateRow(
                entry.id,
                "account",
                e.target.value
              )
            }
            className="rounded border px-2 py-1"
            placeholder="Reikningslykill"
          />

          <input
            value={entry.text}
            disabled={!canEdit}
            onChange={(e) =>
              updateRow(
                entry.id,
                "text",
                e.target.value
              )
            }
            className="rounded border px-2 py-1"
            placeholder="Texti"
          />

          <input
            type="number"
            step="0.01"
            min="0"
            value={entry.debit}
            disabled={!canEdit}
            onChange={(e) =>
              updateRow(
                entry.id,
                "debit",
                e.target.value
              )
            }
            className="rounded border px-2 py-1"
            placeholder="Debet"
          />

          <input
            type="number"
            step="0.01"
            min="0"
            value={entry.credit}
            disabled={!canEdit}
            onChange={(e) =>
              updateRow(
                entry.id,
                "credit",
                e.target.value
              )
            }
            className="rounded border px-2 py-1"
            placeholder="Kredit"
          />
          {!reviewedAt && (
  <button
    type="button"
    onClick={async () => {
      await deleteDetectedDocumentEntry(entry.id);
      router.refresh();
    }}
    className="rounded border border-red-300 px-2 py-1 text-red-700"
  >
    Eyða
  </button>
)}
        </div>
      ))}
{!reviewedAt && (
  <button
    type="button"
    onClick={async () => {
      await addDetectedDocumentEntry(documentId);
      router.refresh();
    }}
    className="mt-3 rounded border border-blue-600 px-3 py-2 text-sm text-blue-600"
  >
    + Bæta við bókunarlínu
  </button>
)}
      <div className="rounded bg-slate-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>
            Debet samtals:
          </span>

          <strong>
            {totalDebit.toLocaleString("en-US")} kr.
          </strong>
        </div>

        <div className="mt-1 flex justify-between">
          <span>
            Kredit samtals:
          </span>

          <strong>
            {totalCredit.toLocaleString("en-US")} kr.
          </strong>
        </div>

        <div
  className={`mt-2 font-medium ${
    rows.length === 0
      ? "text-amber-700"
      : balances
        ? "text-green-700"
        : "text-red-700"
  }`}
>
  {rows.length === 0
    ? "⚠ Engar bókunarlínur"
    : balances
      ? "✓ Bókun stemmir"
      : "⚠ Debet og kredit stemma ekki"}
</div>
      </div>

{reviewedAt && !voucherNumber && !duplicateMarkedAt && (
  <>
    {hasUnsavedChanges ? (
  <button
    type="button"
    onClick={handleSave}
    disabled={saving || !balances}
    className="rounded bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
  >
    {saving ? "Vista..." : "Vista breytingar"}
  </button>
) : canBook ? (
  <ApproveDocumentButton documentId={documentId} />
) : (
  <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Ekki bókunarheimild
  </div>
)}
</>
)}
{reviewedAt &&
  !voucherNumber &&
  duplicateOfDocumentId &&
  duplicateVoucherNumber &&
  !duplicateMarkedAt && (
    <button
      type="button"
      onClick={handleMarkDuplicate}
      className="rounded bg-amber-600 px-4 py-2 font-medium text-white"
    >
      Merkja sem tvírit af fylgiskjali {duplicateVoucherNumber}
    </button>
  )}
{duplicateMarkedAt && duplicateVoucherNumber && (
  <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
    Tvírit – þegar bókað sem fylgiskjal {duplicateVoucherNumber}
  </div>
)}

{message && (
  <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-700">
    ✓ {message}
  </div>
)}

{error && (
  <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
    {error}
  </div>
)}

</div>
);
}