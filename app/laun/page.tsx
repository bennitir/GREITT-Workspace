import { requireCompanyModule } from "@/lib/core/require-company-module";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";

export default async function LaunPage() {
  await requireCompanyModule("laun");

  return (
    <main className="space-y-6">
      <PageHeader
        title="Laun"
        description="Fyrsta vinnuútgáfa GLÖGGT Launa – kjör, tímar, hlunnindi, reglur og launakeyrsla í skýru flæði."
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card><p className="text-sm text-slate-500">Starfsmenn</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">Virk ráðningarsambönd</p></Card>
        <Card><p className="text-sm text-slate-500">Næsta launakeyrsla</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">Tímabil verður valið</p></Card>
        <Card><p className="text-sm text-slate-500">Ósamþykktir tímar</p><p className="mt-2 text-3xl font-bold">—</p><p className="mt-1 text-sm text-slate-500">Frá Vinnustund</p></Card>
        <Card><p className="text-sm text-slate-500">Launareglur</p><p className="mt-2 text-3xl font-bold">2026</p><p className="mt-1 text-sm text-slate-500">Útgáfustýrðar eftir gildistíma</p></Card>
      </div>

      <Card className="border-2 border-slate-900">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Launakeyrsla</p>
        <h2 className="mt-1 text-2xl font-bold">Tímar → Yfirferð → Reikna → Samþykkja → Skil</h2>
        <p className="mt-2 text-slate-600">Gamlar launakeyrslur halda alltaf þeim skattareglum og skattmati sem giltu á launatímabilinu.</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card><h2 className="text-xl font-bold">Starfsmannaspjald</h2><p className="mt-2 text-slate-600">Mánaðarlaun, tímakaup, starfshlutfall, fastir launaliðir og gildistímar. Kjör eru ekki bundin við eina launategund.</p></Card>
        <Card><h2 className="text-xl font-bold">Hlunnindi</h2><p className="mt-2 text-slate-600">Bifreið, fæði og fleiri tegundir sem sjálfstæðir launaliðir. Full/takmörkuð bifreiðaumráð fá rétta reikniaðferð.</p></Card>
        <Card><h2 className="text-xl font-bold">Launareglur</h2><p className="mt-2 text-slate-600">Skattþrep, persónuafsláttur, tryggingagjald og skattmat eru útgáfustýrð. Ný gögn eru borin saman og staðfest áður en þau taka gildi.</p></Card>
        <Card><h2 className="text-xl font-bold">Tímar og fjarvistir</h2><p className="mt-2 text-slate-600">Samþykktar stundir, orlof, veikindi og önnur frávik koma úr Vinnustund án tvískráningar.</p></Card>
        <Card><h2 className="text-xl font-bold">Verktakar</h2><p className="mt-2 text-slate-600">Verktaka er ekki laun. Sami einstaklingur getur skilað tímum sem verktaki en greiðsluferlið er haldið bókhaldslega aðskildu.</p></Card>
        <Card><h2 className="text-xl font-bold">Skil og bókhald</h2><p className="mt-2 text-slate-600">Launaseðlar, greiðslur, opinber skil og sjálfvirk bókun verða lokaskref launakeyrslunnar.</p></Card>
      </div>

      <Card className="bg-slate-50">
        <h2 className="text-xl font-bold">Öryggisregla</h2>
        <p className="mt-2 text-slate-700">Engin opinber prósenta verður harðkóðuð inn í launakeyrslu. Reglur hafa heimild, gildistíma, útgáfu og breytingasögu.</p>
      </Card>
    </main>
  );
}
