"use client";

import { formatNumber } from "@/lib/locale";
import { useEffect, useState } from "react";

type BookingRow = {
  id: number;
  entryRole: "EXPENSE" | "PAYMENT" | "SYSTEM";
  account: string;
  accountName: string;
  vatRate: number | null;
  vatAccount: string | null;
  vatRequiresConfirmation: boolean;
  vatConfirmed: boolean | null;
  text: string;
  debit: string;
  credit: string;
};

type AccountOption = {
  id: number;
  number: string;
  name: string;
  vatRate: number | null;
  vatAccount: string | null;
  vatRequiresConfirmation: boolean;
  entryRole: string;
};

type ManualBookingEditorProps = {
  accounts: AccountOption[];
  amount: string;
  onRowsChange: (rows: BookingRow[]) => void;
};
export default function ManualBookingEditor({
  accounts,
  amount,
  onRowsChange,
}: ManualBookingEditorProps) {
  const [rows, setRows] = useState<BookingRow[]>([
        {
            
      id: 1,
      entryRole: "EXPENSE",
      account: "",
      accountName: "",
      vatRate: null,
vatAccount: null,
vatRequiresConfirmation: false,
vatConfirmed: null,
      text: "",
      debit: "",
      credit: "",
    },
        {
      id: 2,
      entryRole: "PAYMENT",
      account: "",
      accountName: "",
      vatRate: null,
vatAccount: null,
vatRequiresConfirmation: false,
vatConfirmed: null,
      text: "",
      debit: "",
      credit: "",
    },
  ]);
useEffect(() => {
  onRowsChange(rows);
}, [rows, onRowsChange]);

  function updateRow(
  id: number,
  field: keyof Omit<BookingRow, "id">,
  value: string
) {
  setRows((currentRows) =>
    currentRows.map((row) => {
      if (row.id !== id) {
        return row;
      }

      if (field === "account") {
        const matchedAccount = accounts.find(
          (account) => account.number === value
        );

        return {
  ...row,
  account: value,
  accountName: matchedAccount?.name ?? "",
  vatRate: matchedAccount?.vatRate ?? null,
  vatAccount: matchedAccount?.vatAccount ?? null,
  vatRequiresConfirmation:
    matchedAccount?.vatRequiresConfirmation ?? false,
    credit: row.entryRole === "PAYMENT" ? amount : row.credit,
    vatConfirmed: null,
    
};
}

      return {
        ...row,
        [field]: value,
      };
    })
  );
}
  
function setVatConfirmed(id: number, value: boolean) {
  setRows((currentRows) => {
    const sourceRow = currentRows.find((row) => row.id === id);

    if (!sourceRow) {
      return currentRows;
    }

    const vatRowId = -id;

    if (
      !value ||
      !sourceRow.vatRate ||
      !sourceRow.vatAccount ||
      !amount
    ) {
      return currentRows
  .filter((row) => row.id !== vatRowId)
  .map((row) =>
    row.id === id
      ? {
          ...row,
          vatConfirmed: value,
          debit: value ? row.debit : amount,
        }
      : row
  );
    }

    const totalAmount = Number(amount);

    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return currentRows.map((row) =>
        row.id === id
          ? {
              ...row,
              vatConfirmed: value,
            }
          : row
      );
    }

    const vatAmount =
      totalAmount -
      totalAmount / (1 + sourceRow.vatRate / 100);

    const netAmount = totalAmount - vatAmount;

    const vatAccount = accounts.find(
      (account) => account.number === sourceRow.vatAccount
    );

    const updatedRows = currentRows
      .filter((row) => row.id !== vatRowId)
      .map((row) =>
        row.id === id
          ? {
              ...row,
              vatConfirmed: true,
              debit: netAmount.toFixed(2),
            }
          : row
      );

    return [
      ...updatedRows,
      {
        id: vatRowId,
        entryRole: "SYSTEM",
        account: sourceRow.vatAccount,
        accountName: vatAccount?.name ?? "Innskattur",
        vatRate: null,
        vatAccount: null,
        vatRequiresConfirmation: false,
        vatConfirmed: null,
        text: `Innskattur ${sourceRow.vatRate}%`,
        debit: vatAmount.toFixed(2),
        credit: "",
      },
    ];
  });
}
  function addRow() {
    setRows((currentRows) => [
      ...currentRows,
      
        {
  id: Date.now(),
entryRole: "EXPENSE",
  account: "",
  accountName: "",
  vatRate: null,
  vatAccount: null,
  vatRequiresConfirmation: false,
  vatConfirmed: null,
  text: "",
  debit: "",
  credit: "",
},
    ]);
  }

  function removeRow(id: number) {
    setRows((currentRows) => {
      if (currentRows.length <= 1) {
        return currentRows;
      }

      return currentRows.filter((row) => row.id !== id);
    });
  }
  const totalDebit = rows.reduce(
    (sum, row) => sum + (Number(row.debit) || 0),
    0
  );

  const totalCredit = rows.reduce(
    (sum, row) => sum + (Number(row.credit) || 0),
    0
  );

  const difference = totalDebit - totalCredit;

  const isBalanced =
    totalDebit > 0 &&
    totalCredit > 0 &&
    Math.abs(difference) < 0.01;
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Bókun</h2>

        <p className="mt-1 text-sm text-gray-600">
          Veldu reikninga og skráðu hvernig fylgiskjalið á að bókast.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_1.5fr_1fr_1fr_auto]"
          >
            <div>
  <input
    type="text"
    list={`accounts-${row.id}`}
    placeholder="Reikningslykill eða heiti"
    value={row.account}
    onChange={(event) =>
      updateRow(row.id, "account", event.target.value)
    }
    className="w-full rounded border px-3 py-2"
  />

  <datalist id={`accounts-${row.id}`}>
  {[...accounts]
  .sort((a, b) => {
    const aPreferred = a.entryRole === row.entryRole ? 0 : 1;
    const bPreferred = b.entryRole === row.entryRole ? 0 : 1;

    if (aPreferred !== bPreferred) {
      return aPreferred - bPreferred;
    }

    return a.number.localeCompare(b.number);
  })
  .map((account) => (
      <option
        key={account.id}
        value={account.number}
      >
        {account.number} – {account.name}
      </option>
    ))}
</datalist>
  {row.accountName && (
  <div className="mt-1 text-xs text-gray-500">
    {row.accountName}
  </div>
)}
{row.account && (
  <div className="mt-1 text-xs text-gray-500">
    {row.vatRate ? (
      <>
        VSK {row.vatRate}% → {row.vatAccount ?? "VSK-lykill vantar"}
        {row.vatRequiresConfirmation && (
  <div className="mt-2 flex items-center gap-2">
    <span className="font-medium text-amber-700">
      VSK þarf staðfestingu:
    </span>

    <button
      type="button"
     onClick={() => setVatConfirmed(row.id, true)}
      className={`rounded border px-2 py-1 text-xs ${
  row.vatConfirmed === true
    ? "bg-green-100 border-green-400"
    : "hover:bg-gray-50"
}`}
    >
      Já
    </button>

    <button
      type="button"
      onClick={() => setVatConfirmed(row.id, false)}
      className={`rounded border px-2 py-1 text-xs ${
  row.vatConfirmed === false
    ? "bg-red-100 border-red-400"
    : "hover:bg-gray-50"
}`}
    >
      Nei
    </button>
  </div>
)}
      </>
    ) : (
      row.account === "2520" ? null : "VSK ekki stillt"
    )}
  </div>
)}
</div>

            <input
              type="text"
              placeholder="Texti"
              value={row.text}
              onChange={(event) =>
                updateRow(row.id, "text", event.target.value)
              }
              className="rounded border px-3 py-2"
            />

            <input
              type="number"
              placeholder="Debet"
              value={row.debit}
              onChange={(event) =>
                updateRow(row.id, "debit", event.target.value)
              }
              className="rounded border px-3 py-2"
            />

            <input
              type="number"
              placeholder="Kredit"
              value={row.credit}
              onChange={(event) =>
                updateRow(row.id, "credit", event.target.value)
              }
              className="rounded border px-3 py-2"
            />

            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={rows.length <= 1}
              className="rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Eyða
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-4 rounded-lg border px-4 py-2 font-medium hover:bg-gray-50"
      >
        + Bæta við línu
      </button>
      <div
  className={`mt-4 rounded-lg border p-4 ${
    isBalanced
      ? "border-green-300 bg-green-50"
      : "border-yellow-300 bg-yellow-50"
  }`}
>
  <div className="grid gap-2 md:grid-cols-3">
    <div>
      <span className="text-sm text-gray-600">Debet samtals</span>
      <div className="font-semibold">
        {formatNumber(totalDebit)} kr.
      </div>
    </div>

    <div>
      <span className="text-sm text-gray-600">Kredit samtals</span>
      <div className="font-semibold">
        {formatNumber(totalCredit)} kr.
      </div>
    </div>

    <div>
      <span className="text-sm text-gray-600">Mismunur</span>
      <div className="font-semibold">
        {formatNumber(Math.abs(difference))} kr.
      </div>
    </div>
  </div>

  <div className="mt-3 text-sm font-medium">
    {isBalanced
      ? "✓ Bókun stemmir"
      : "⚠ Bókun stemmir ekki enn"}
  </div>
</div>
    </section>
  );
}