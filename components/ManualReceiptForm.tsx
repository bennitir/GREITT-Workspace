"use client";

import {
  createManualReceipt,
  approveManualReceipt,
  prepareExistingReceiptManually,
} from "@/app/actions/receiptActions";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import TextInput from "@/components/ui/TextInput";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import ManualBookingEditor from "@/components/ManualBookingEditor";

type AccountOption = {
  id: number;
  number: string;
  name: string;
  vatRate: number | null;
  vatAccount: string | null;
  vatRequiresConfirmation: boolean;
  type: string;
  entryRole: string;
};

type PendingReceiptOption = {
  receiptId: number;
  documentId: number | null;
  label: string;
  originalFileUrl: string | null;
};

type ManualReceiptFormProps = {
  accounts: AccountOption[];
  vatRegistered: boolean | null;
  pendingReceipts: PendingReceiptOption[];
};

export default function ManualReceiptForm({
  accounts,
  vatRegistered,
  pendingReceipts,
}: ManualReceiptFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [selectedSource, setSelectedSource] = useState("");

  const [bookingEntries, setBookingEntries] = useState<
    {
      account: string;
      text: string;
      debit: number;
      credit: number;
    }[]
  >([]);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedPending = pendingReceipts.find(
    (item) => `${item.receiptId}:${item.documentId ?? ""}` === selectedSource,
  );

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSaving) {
      return;
    }

    setError("");
    setIsSaving(true);

    try {
      const formData = new FormData(event.currentTarget);

      if (bookingEntries.length === 0) {
        throw new Error("Engar bókunarlínur eru skráðar.");
      }

      if (selectedPending) {
        const result = await prepareExistingReceiptManually(
          selectedPending.receiptId,
          selectedPending.documentId,
          formData,
          bookingEntries,
        );

        router.push(
          `/fylgiskjol/${result.receiptId}?document=${result.documentId}`,
        );
        router.refresh();
        return;
      }

      const { receiptId } = await createManualReceipt(formData);
      await approveManualReceipt(receiptId, bookingEntries);
      router.push(`/fylgiskjol/${receiptId}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Villa kom upp við handvirka skráningu fylgiskjals.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const handleRowsChange = useCallback(
    (
      rows: {
        account: string;
        text: string;
        debit: string;
        credit: string;
      }[],
    ) => {
      setBookingEntries(
        rows
          .filter((row) => row.account)
          .map((row) => ({
            account: row.account,
            text: row.text,
            debit: Number(row.debit) || 0,
            credit: Number(row.credit) || 0,
          })),
      );
    },
    [],
  );

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Vinnuleið</h2>

        <label className="mb-1 block font-medium">
          Velja fyrirliggjandi óunnið fylgiskjal
        </label>
        <select
          value={selectedSource}
          onChange={(event) => setSelectedSource(event.target.value)}
          className="w-full rounded-lg border px-3 py-2"
        >
          <option value="">
            Nýtt handvirkt fylgiskjal – bein handskráning
          </option>
          {pendingReceipts.map((item) => (
            <option
              key={`${item.receiptId}:${item.documentId ?? ""}`}
              value={`${item.receiptId}:${item.documentId ?? ""}`}
            >
              {item.label}
            </option>
          ))}
        </select>

        {selectedPending ? (
          <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">
              Handvirk undirbúningur → yfirferð
            </p>
            <p className="mt-1">
              Reitirnir eru ekki fylltir sjálfkrafa úr AI-greiningu. Bókarinn
              skráir sjálfur þær upplýsingar og bókunarlínur sem eiga að fara í
              yfirferð.
            </p>
            {selectedPending.originalFileUrl ? (
              <a
                href={selectedPending.originalFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block font-medium text-blue-700 underline"
              >
                Opna frumskjalið í nýjum flipa
              </a>
            ) : (
              <p className="mt-2 text-sm text-amber-700">
                Frumskjalsslóð fannst ekki fyrir þetta fylgiskjal.
              </p>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Þessi leið varðveitir núverandi möguleika á beinni handskráningu.
            Hún er óháð AI.
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Fylgiskjal</h2>

        <div className="grid gap-4 md:grid-cols-3">
          <IcelandicDateInput label="Dagsetning" name="date" />

          <TextInput label="Lýsing" name="description" />

          <div>
            <label className="mb-1 block font-medium">Upphæð</label>
            <input
              type="number"
              name="amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>

          {!selectedPending && (
            <div>
              <label className="mb-1 block font-medium">
                Fylgiskjalsnúmer
              </label>
              <input
                type="number"
                name="voucherNumber"
                className="w-full rounded border px-3 py-2"
                placeholder="Sjálfvirkt ef autt"
              />
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <TextInput label="Seljandi" name="merchantName" />
          <TextInput label="Kennitala seljanda" name="merchantKennitala" />
          <TextInput
            label="Reiknings-/kvittunarnúmer"
            name="receiptNumber"
          />
        </div>

        {!selectedPending && (
          <div className="mt-5">
            <label className="mb-1 block font-medium">Frumskjal</label>
            <input
              type="file"
              name="file"
              accept="application/pdf,image/*,.xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="block w-full rounded-lg border px-3 py-2"
            />
          </div>
        )}
      </section>

      <ManualBookingEditor
        accounts={accounts}
        amount={amount}
        vatRegistered={vatRegistered}
        onRowsChange={handleRowsChange}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={isSaving}
        className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSaving
          ? selectedPending
            ? "Sendi í yfirferð..."
            : "Bóka..."
          : selectedPending
            ? "Senda í yfirferð"
            : "Bóka fylgiskjal"}
      </button>
    </form>
  );
}
