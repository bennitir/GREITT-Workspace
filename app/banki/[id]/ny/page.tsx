import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import { createBankTransaction } from "@/app/banki/actions";
type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function NyBankafaerslaPage({ params }: Props) {
  const { id } = await params;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">＋ Ný bankafærsla</h1>

      <div className="mt-6 max-w-2xl rounded-lg border p-6">
        <p className="text-gray-600">
          Bankareikningur nr. {id}
        </p>

        <form action={createBankTransaction} className="mt-6 space-y-4">
  <input
    type="hidden"
    name="bankAccountId"
    value={id}
  />

  <div>
    <label className="mb-1 block font-medium">
      Dagsetning
    </label>

    <IcelandicDateInput
  name="date"
  required
/>
  </div>

  <div>
    <label className="mb-1 block font-medium">
      Texti
    </label>

    <input
      type="text"
      name="text"
      className="w-full rounded-lg border px-3 py-2"
      placeholder="Próf bankafærsla"
      required
    />
  </div>

  <div>
    <label className="mb-1 block font-medium">
      Upphæð
    </label>

    <input
      type="number"
      name="amount"
      step="0.01"
      className="w-full rounded-lg border px-3 py-2"
      placeholder="1000"
      required
    />
  </div>

  <button
    type="submit"
    className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
  >
    Vista bankafærslu
  </button>
</form>

      </div>
    </main>
  );
}