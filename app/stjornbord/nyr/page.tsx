import { createUser } from "@/app/actions/userActions";
import Link from "next/link";

export default function NyrNotandiPage() {
  return (
    <main className="p-8">
      <div className="mb-6">
        <Link
          href="/stjornbord"
          className="text-blue-600 hover:underline"
        >
          ← Til baka í stjórnstöð
        </Link>

        <h1 className="mt-4 text-3xl font-bold">
          Nýr notandi
        </h1>

        <p className="mt-1 text-slate-600">
          Stofna notanda og velja hlutverk.
        </p>
      </div>

      <div className="max-w-2xl rounded-lg border bg-white p-6">
  <form action={createUser} className="space-y-5">
          <div>
            <label className="mb-1 block font-semibold">
              Nafn
            </label>
            <input
              type="text"
              name="name"
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block font-semibold">
              Netfang
            </label>
            <input
              type="email"
              name="email"
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
    minLength={8}
    className="w-full rounded border px-3 py-2"
  />
</div>

          <div>
            <label className="mb-1 block font-semibold">
              Hlutverk
            </label>

            <select
              name="role"
              defaultValue="CLIENT"
              className="w-full rounded border px-3 py-2"
            >
              <option value="ADMIN">
                Kerfisstjóri
              </option>
              <option value="BOOKKEEPER">
                Bókari
              </option>
              <option value="CLIENT">
                Viðskiptavinur
              </option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white"
          >
            Stofna notanda
          </button>
        </form>
</div>
    </main>
  );
}