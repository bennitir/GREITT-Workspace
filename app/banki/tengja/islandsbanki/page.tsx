import { createBankAccount } from "@/app/banki/actions";

export default function IslandsbankiPage() {
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">🏦 Íslandsbanki</h1>

      <div className="mt-6 max-w-2xl rounded-lg border p-6">
        <h2 className="text-xl font-semibold">
          Skrá bankareikning
        </h2>

        <p className="mt-2 text-gray-600">
          Bankareikningurinn verður tengdur við virkt fyrirtæki.
        </p>

        <form action={createBankAccount} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block font-medium">
              Reikningsnúmer
            </label>

            <input
              type="text"
              name="accountNumber"
              className="w-full rounded-lg border px-3 py-2"
              placeholder="0541-26-005511"
              required
            />
          </div>

          <div>
            <label className="mb-1 block font-medium">
              IBAN
            </label>

            <input
              type="text"
              name="iban"
              className="w-full rounded-lg border px-3 py-2"
              placeholder="IS52..."
              required
            />
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            Vista bankareikning
          </button>
        </form>
      </div>
    </main>
  );
}