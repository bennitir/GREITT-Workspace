import ModulePrototype from "@/components/modules/ModulePrototype";
import { requireCompanyModule } from "@/lib/core/require-company-module";

export default async function BirgdirPage() {
  await requireCompanyModule("birgdir");

  return (
    <ModulePrototype
      eyebrow="GLÖGGT Birgðir"
      title="Birgðir – vinnuskissa"
      intro="Birgðakerfið á að halda utan um stöðu og hreyfingar án þess að verða þungt. Síðar tengjast innkaup, sala, verk og Innsýn sömu vörugögnum."
      sections={[
        { title: "Birgðastaða", description: "Magn, verðmæti, staðsetning og vörur sem nálgast lágmarksstöðu." },
        { title: "Vörur", description: "Vörunúmer, heiti, flokkar, innkaupsverð, söluverð og birgðareglur." },
        { title: "Hreyfingar", description: "Innkaup, sala, notkun á verk, leiðréttingar og rekjanleg breytingasaga." },
        { title: "Innkaup", description: "Tillögur að pöntun þegar birgðir lækka og síðar tenging við móttekin fylgiskjöl." },
        { title: "Talning", description: "Einföld birgðatalning og skýr frávik milli kerfis og raunbirgða." },
        { title: "Innsýn", description: "Veltuhraði, bundið fé, framlegð og efnisnotkun eftir vöru eða verkefni." },
      ]}
      note="Við látum þessa einingu þroskast með raunverulegri notkun og tengjum hana ekki of snemma við flóknar reglur."
    />
  );
}
