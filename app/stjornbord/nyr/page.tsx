import { createUser } from "@/app/actions/userActions";
import Link from "next/link";
import { adminText } from "@/lib/i18n/admin";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";

export default async function NyrNotandiPage() {
  const language = await getCurrentInterfaceLanguage();
  const t = adminText(language);

  return (
    <main className="p-8">
      <div className="mb-6">
        <Link href="/stjornbord" className="text-blue-600 hover:underline">{t.newUser.back}</Link>
        <h1 className="mt-4 text-3xl font-bold">{t.newUser.title}</h1>
        <p className="mt-1 text-slate-600">{t.newUser.subtitle}</p>
      </div>

      <div className="max-w-2xl rounded-lg border bg-white p-6">
        <form action={createUser} className="space-y-5">
          <div>
            <label className="mb-1 block font-semibold">{t.newUser.name}</label>
            <input type="text" name="name" required className="w-full rounded border px-3 py-2" />
          </div>

          <div>
            <label className="mb-1 block font-semibold">{t.newUser.email}</label>
            <input type="email" name="email" required className="w-full rounded border px-3 py-2" />
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="font-semibold text-blue-900">{t.newUser.accessInfo}</p>
            <p className="mt-1 text-sm text-blue-800">{t.newUser.accessInfoText}</p>
          </div>

          <div>
            <label className="mb-1 block font-semibold">{t.newUser.role}</label>
            <select name="role" defaultValue="CLIENT" className="w-full rounded border px-3 py-2">
              <option value="ADMIN">{t.roles.ADMIN}</option>
              <option value="BOOKKEEPER">{t.roles.BOOKKEEPER}</option>
              <option value="CLIENT">{t.roles.CLIENT}</option>
            </select>
          </div>

          <button type="submit" className="rounded bg-blue-600 px-4 py-2 font-medium text-white">
            {t.newUser.create}
          </button>
        </form>
      </div>
    </main>
  );
}
