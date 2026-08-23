import { loginUser } from "@/app/actions/userActions";

export default function InnskraningPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-3xl font-bold">Innskráning</h1>

      <form action={loginUser} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block font-semibold">
            Netfang
          </label>

          <input
            type="email"
            name="email"
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block font-semibold">
            Lykilorð
          </label>

          <input
            type="password"
            name="password"
            required
            className="w-full rounded border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Skrá inn
        </button>
      </form>
    </main>
  );
}