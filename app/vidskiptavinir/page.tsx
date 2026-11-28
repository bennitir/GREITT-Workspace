import { requireActiveCompanyReadAccess } from "@/lib/core/access-control";

export default async function VidskiptavinirPage() {
  await requireActiveCompanyReadAccess();
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Viðskiptavinir</h1>
      <p className="mt-4 max-w-2xl">
        Eldra viðskiptamannasvæðið er tímabundið óvirkt meðan fyrirtækjaaðgreining
        þess er útfærð og sannprófuð. Fyrirliggjandi gögn hafa ekki verið eydd.
      </p>
    </main>
  );
}
