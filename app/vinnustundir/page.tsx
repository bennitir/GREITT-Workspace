import ModulePrototype from "@/components/modules/ModulePrototype";
import { requireCompanyModule } from "@/lib/core/require-company-module";

export default async function VinnustundirPage() {
  await requireCompanyModule("vinnustundir");

  return (
    <ModulePrototype
      eyebrow="GLÖGGT Vinnustundir"
      title="Vinnustundir – frumgerð"
      intro="Einföld tímaskráning fyrir starfsmanninn, en öflug yfirferð fyrir stjórnanda. Gögnin eiga síðar að nærast beint inn í Laun og Innsýn."
      imageSrc="/prototypes/vinnustundir.png"
      imageAlt="Hönnunarskissa að GLÖGGT Vinnustundum"
      sections={[
        { title: "Yfirlit", description: "Hver er í vinnu, hver er fjarverandi, heildartímar, yfirvinna og atriði sem þarfnast athygli." },
        { title: "Tímaskráning", description: "Inn/út, hlé, verkefni og leiðréttingar með skýrri breytingasögu." },
        { title: "Fjarvistir", description: "Orlof, veikindi, launalaust leyfi og aðrar fjarvistir með stöðu og samþykki." },
        { title: "Samþykki", description: "Vinnubakki fyrir óvenjulegar skráningar, vantaða tíma, beiðnir og frávik." },
        { title: "Starfsmenn", description: "Grunnupplýsingar, starfshlutfall, vinnutími og réttindi sem tengjast tímaskráningu." },
        { title: "Innsýn", description: "Þróun vinnustunda, yfirvinna, kostnaður og síðar samanburður við sölu, verk og laun." },
      ]}
      note="Við mótum fyrst daglegt flæði starfsmanns og stjórnanda. Síðan ákveðum við hvaða reglur og gögn verða varanleg."
    />
  );
}
