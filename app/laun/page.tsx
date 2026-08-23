import ModulePrototype from "@/components/modules/ModulePrototype";
import { requireCompanyModule } from "@/lib/core/require-company-module";

export default async function LaunPage() {
  await requireCompanyModule("laun");

  return (
    <ModulePrototype
      eyebrow="GLÖGGT Laun"
      title="Laun – frumgerð"
      intro="Launavinnsla sem byrjar á yfirferð gagna úr Vinnustundum og endar í launaseðlum, greiðslum, skilum og bókhaldi."
      imageSrc="/prototypes/laun.png"
      imageAlt="Hönnunarskissa að GLÖGGT Launakerfi"
      sections={[
        { title: "Launakeyrsla", description: "Tímabil, staða vinnslu og skýr skref frá yfirferð til samþykktrar launakeyrslu." },
        { title: "Starfsmenn", description: "Launaforsendur, starfshlutfall, fastar greiðslur, frádrættir og réttindi." },
        { title: "Tímar og fjarvistir", description: "Samþykktar vinnustundir, yfirvinna, orlof og veikindi koma úr Vinnustundum." },
        { title: "Launaseðlar", description: "Yfirferð, útgáfa og örugg afhending launaseðla." },
        { title: "Greiðslur og skil", description: "Greiðslulisti, staðgreiðsla, lífeyrir og önnur launatengd skil." },
        { title: "Innsýn", description: "Launakostnaður eftir tímabili, starfsmanni, verkefni og síðar hlutfall af tekjum." },
      ]}
      note="Næst ræðum við íslenska launavinnslu skref fyrir skref og einföldum hana áður en útreikningsvélin er smíðuð."
    />
  );
}
