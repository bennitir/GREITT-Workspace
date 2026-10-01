import ModulePrototype from "@/components/modules/ModulePrototype";
import { redirect } from "next/navigation";
import { getCompanyAccess } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { hasSalesPermission } from "@/lib/core/sales-permissions";

export default async function SalaPage() {
  const companyId = await requireCompanyModule("sala");
  const access = await getCompanyAccess(companyId);

  if (!hasSalesPermission(access, "SALE_USE")) {
    redirect("/");
  }

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
