"use client";
import {
  createManualReceipt,
  approveManualReceipt,
} from "@/app/actions/receiptActions";
import { useCallback, useState } from "react";
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
  entryRole: string;
};

type ManualReceiptFormProps = {
  accounts: AccountOption[];
};

export default function ManualReceiptForm({
  accounts,
}: ManualReceiptFormProps) {
  const [amount, setAmount] = useState("");
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

async function handleSubmit(
  event: React.FormEvent<HTMLFormElement>
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

    const { receiptId } =
      await createManualReceipt(formData);

    await approveManualReceipt(
      receiptId,
      bookingEntries
    );
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Villa kom upp við bókun fylgiskjals."
    );
  } finally {
    setIsSaving(false);
  }
}
const handleRowsChange = useCallback((rows: {
  account: string;
  text: string;
  debit: string;
  credit: string;
}[]) => {
  setBookingEntries(
    rows
      .filter((row) => row.account)
      .map((row) => ({
        account: row.account,
        text: row.text,
        debit: Number(row.debit) || 0,
        credit: Number(row.credit) || 0,
      }))
  );
}, []);
  return (
    <form
  className="space-y-6"
  onSubmit={handleSubmit}
>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">
          Fylgiskjal
        </h2>

                <div className="grid gap-4 md:grid-cols-3">
          <IcelandicDateInput
            label="Dagsetning"
            name="date"
          />

          <TextInput
            label="Lýsing"
            name="description"
          />

          <div>
            <label className="mb-1 block font-medium">
              Upphæð
            </label>

            

            <input
              type="number"
              name="amount"
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value)
              }
              className="w-full rounded-lg border px-3 py-2"
            />
          </div>
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
        </div>

<div className="mt-5 grid gap-4 md:grid-cols-3">
  <TextInput
    label="Seljandi"
    name="merchantName"
  />

  <TextInput
    label="Kennitala seljanda"
    name="merchantKennitala"
  />

  <TextInput
    label="Reiknings-/kvittunarnúmer"
    name="receiptNumber"
  />
</div>
        <div className="mt-5">
          <label className="mb-1 block font-medium">
            Frumskjal
          </label>

          <input
            type="file"
            name="file"
            accept="application/pdf,image/*"
            className="block w-full rounded-lg border px-3 py-2"
          />
        </div>
      </section>

      <ManualBookingEditor
  accounts={accounts}
  amount={amount}
 onRowsChange={handleRowsChange}
  
/>
{error && (
  <p className="text-sm text-red-600">
    {error}
  </p>
)}
<button
  type="submit"
  disabled={isSaving}
  className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  {isSaving ? "Bóka..." : "Bóka fylgiskjal"}
</button>
    </form>
  );
}