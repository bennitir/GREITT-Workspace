import { requireCompanyModule } from "@/lib/core/require-company-module";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

const items = [
  ["Stimplun", "Inn / út", "Símaapp og vefur. Hlé og deild/verkefni fylgja vinnulotunni."],
  ["Mínar stundir", "Starfsmaður sér allt", "Dagur, vika og mánuður. Leiðréttingar eyða aldrei upprunalegri skráningu."],
  ["Frí og fjarvistir", "Beiðnir og staða", "Orlof, veikindi, launalaust leyfi og aðrar fjarvistir með samþykki."],
  ["Samþykki", "Vinnubakki stjórnanda", "Vantaðar stimplanir, óvenjulegir tímar og breytingarbeiðnir á einum stað."],
];

export default async function VinnustundirPage() {
  await requireCompanyModule("vinnustundir");

  return (
    <main className="space-y-6">
      <PageHeader
        title="Vinnustund"
        description="Tímaskráning sem starfsmaður skilur strax – með rekjanleika fyrir stjórnanda og tengingu við Laun."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Í vinnu núna</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">Tengist lifandi stimplun</p></Card>
        <Card><p className="text-sm text-slate-500">Stundir í vikunni</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">Samþykktar + óyfirfarnar</p></Card>
        <Card><p className="text-sm text-slate-500">Beiðnir</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">Frí og leiðréttingar</p></Card>
        <Card><p className="text-sm text-slate-500">Til samþykktar</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">Fyrir næstu launakeyrslu</p></Card>
      </div>

      <Card className="border-2 border-slate-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Starfsmaður</p>
            <h2 className="mt-1 text-2xl font-bold">Stimpla inn / út</h2>
            <p className="mt-1 text-slate-600">Símaútgáfan fær sama einfalda flæði og getur síðar tekið myndir af fylgiskjölum.</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-lg bg-slate-900 px-6 py-3 text-lg font-semibold text-white">Stimpla inn</button>
            <button className="rounded-lg border px-6 py-3 text-lg font-semibold text-slate-400" disabled>Stimpla út</button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map(([title, subtitle, text]) => (
          <Card key={title}>
            <p className="text-sm font-semibold text-slate-500">{title}</p>
            <h2 className="mt-1 text-xl font-bold">{subtitle}</h2>
            <p className="mt-2 text-slate-600">{text}</p>
          </Card>
        ))}
      </div>

      <Card className="bg-slate-50">
        <h2 className="text-xl font-bold">Hönnunarregla</h2>
        <p className="mt-2 text-slate-700">Vinnustund starfsmanna og Vinnusaga bókara eru tvær aðskildar þjónustur. Þær mega deila tímavél undir húddinu en aldrei ruglast saman í launum eða reikningagerð.</p>
      </Card>
    </main>
  );
}
