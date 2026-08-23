import ModulePrototype from "@/components/modules/ModulePrototype";
import { requireCompanyModule } from "@/lib/core/require-company-module";

export default async function SalaPage() {
  await requireCompanyModule("sala");

  return (
    <ModulePrototype
      eyebrow="GLÖGGT Sala"
      title="Sala – vinnuskissa"
      intro="Sölukerfið verður mótað með reynslu notandans að leiðarljósi og með nýrri sjálfvirkni þar sem hún sparar raunverulega vinnu."
      sections={[
        { title: "Yfirlit", description: "Sala tímabilsins, ógreitt, gjaldfallið, helstu viðskiptavinir og atriði sem þarf að sinna." },
        { title: "Sölureikningar", description: "Stofna, yfirfara, senda, kreditfæra og fylgjast með greiðslustöðu." },
        { title: "Viðskiptavinir", description: "Samskipta- og viðskiptasaga, greiðsluhegðun og skjöl á einum stað." },
        { title: "Tilboð og pantanir", description: "Frá tilboði í pöntun og reikning án tvískráningar." },
        { title: "Greiðslur", description: "Bankatenging getur síðar parað innborganir sjálfkrafa við rétta reikninga." },
        { title: "Innsýn", description: "Framlegð, þróun sölu, tekjur á vinnustund og samanburður milli viðskiptavina eða verka." },
      ]}
      note="Við teiknum þessa síðu betur saman áður en gagnalíkanið er fest. Hér á reynsla úr raunverulegum sölukerfum að ráða miklu."
    />
  );
}
