# GLÖGGT Innsýn – sjónræn forskrift v1

Dagsetning: 27.09.2026  
Staða: **mockup/forskrift – ekki enn production UI**.

## Markmið fyrstu sýnar

Fyrsta skjámyndin á ekki að vera safn af tugum KPI-korta. Hún á að leiða augað í þessari röð:

1. Hvernig gengur?
2. Hvað breyttist?
3. Hvað skýrir það?
4. Hvað þarf athygli?
5. Hvar sé ég sönnunargögnin?

## Haus

```text
Innsýn                                      [Blönduð | Myndræn | Tölur | Skýring]
Sturla Ólafsson                             [Tímabil: Síðustu 12 mánuðir ▾]
Síðast uppfært: ...                         [Borið saman við fyrra tímabil]
```

Undir haus birtist lítið truth-state skýringarkerfi:

`● Bókað   ○ Þekkt   ◌ Bíður staðfestingar`

Það á að vera rólegt og skýrt, ekki stór viðvörun nema ástæða sé til.

## 1. „Svona stendur reksturinn“

Stórt en einfalt frásagnarsvæði. Hámark 2–4 atriði.

Dæmi um framsetningu, **ekki reiknuð niðurstaða**:

```text
Svona stendur reksturinn

• Tekjur hafa ... miðað við fyrra tímabil.
• Bifreiðatengdur kostnaður skýrir stærstan hluta breytingar í útgjöldum.
• 3 kortafærslur bíða afstemmingar við fylgiskjöl.
• Tvær þekktar greiðslur eru framundan næstu 14 daga.
```

Hvert atriði þarf `Af hverju?` / `Skoða gögn` tengingu.

## 2. Þróun – aðalmyndin

Ein breið mynd yfir tímann, ekki mörg smágröf.

Fyrsta útgáfa:

- x-ás: mánuðir,
- tekjur,
- rekstrarkostnaður,
- niðurstaða.

Sama data series er notuð í Myndræn og Tölur sýn.

Undir grafi:

- breyting frá fyrra samanburðartímabili,
- hvaða mánuður víkur mest,
- smellanlegt tímabil til sundurliðunar.

## 3. Hvert fara peningarnir?

Sundurliðun með láréttum súlum eða stigveldislista.

Fyrsta stig:

- Bifreiðar,
- Matur/veitingar,
- Sími/fjarskipti,
- Skrifstofa/rekstrarvörur,
- Starfsmannatengt,
- Annað.

Notandi smellir á flokk og fær:

`flokkur → undirflokkur/reikningslykill → seljandi → fylgiskjöl/færslur`.

Ekki þvinga merchant í einn flokk. Olís getur t.d. komið fyrir í fleiri en einum tilgangi.

## 4. Mynstur og breytingar

Þetta er ekki frjáls AI-texti. Atriði eru valin úr deterministic niðurstöðum og fá síðan skýringu.

Mögulegar tegundir:

- reglulegur kostnaður breyttist,
- stór einstök kaup,
- flokkur jókst/lækkaði,
- seljandi eða einingarverð breyttist,
- endurtekið mynstur vantar í einn mánuð,
- bókunar-/afstemmingaraðferð breyttist.

Dæmi úr núverandi gögnum sem eru hentug **prófdæmi**, ekki sjálfkrafa stjórnendaniðurstöður:

- Nova sem endurtekið mánaðarmynstur,
- Olís með mörgum tilgangsflokkum,
- bílatengdir lyklar 4710/4720/4730/4740/4750,
- mat/veitingar 4910,
- stærri einstök kaup.

## 5. VISA / greiðslukort og afstemming

Sérsvæði þegar `PaymentCardTransaction` gögn eru til.

```text
VISA og kort
120 færslur á tímabilinu
104 afstemmdar við fylgiskjal
16 bíða afstemmingar
```

Sýna bæði fjölda og fjárhæð.

Drill-down:

`kort → tímabil → færslur → líklegt fylgiskjal → staðfest tenging`.

Innsýn má sýna líklega pörun sem „Þekkt/Bíður staðfestingar“ en ekki sem bókað.

## 6. Framundan / þarfnast athygli

Byggir helst á `FinancialEventScheduleItem`, staðfestum skuldbindingum og rekjanlegum frávikum.

Sýna t.d.:

- gjalddaga,
- skatta,
- lán,
- reglulegar skuldbindingar,
- samninga sem renna út,
- mikilvæg óafstemmd gögn.

Ekki blanda almennri verkefnalista-stjórnun inn nema atriðið hafi rekstrarlega þýðingu fyrir Innsýn.

## 7. Drill-down reglur

Sérhver tala sem má sundurliða á að vera opnanleg.

Dæmi:

```text
Bifreiðar 186.400 kr.
  ↓
4710 Eldsneyti
4720 Viðhald/varahlutir
4750 Annar bifreiðakostnaður
  ↓
Olís / Vélar og Dekk / ...
  ↓
Færslulisti
  ↓
Fylgiskjal / bankafærsla / kortafærsla
  ↓
Frumgagn
```

## 8. Sýnarofinn

### Blönduð

Sjálfgefin tillaga:

- stutt stjórnendaskýring,
- eitt aðalgraf,
- nokkrar tölur,
- helstu frávik/athygli.

### Myndræn

- stærri gröf,
- minni texti,
- sömu niðurstöður.

### Tölur

- töflur,
- tölulegur samanburður,
- export-væn framsetning,
- sömu niðurstöður.

### Skýring

- mannleg skýring,
- fullyrðing + ástæða + sönnunargögn,
- engin ný tölfræði sem hinar sýnirnar hafa ekki.

## 9. Mobile / minni skjár

Fyrsta sýn þarf að hrynja niður í þessa röð:

1. frásögn,
2. athygli,
3. þróun,
4. sundurliðun,
5. kortaafstemming,
6. djúpgreining.

Ekki reyna að þjappa desktop-dashboardi óbreyttu í síma.

## 10. Ekki gera í v1

- ekki byggja 100 sérskýrslur,
- ekki nota kökurit sem sjálfgefna aðalframsetningu,
- ekki sýna AI-ályktun án evidence,
- ekki blanda „þekkt“ og „bókað“ í sömu upphæð án merkingar,
- ekki sækja alla bankasögu til að birta fyrsta skjá,
- ekki byggja á hardcode-uðu ári.
