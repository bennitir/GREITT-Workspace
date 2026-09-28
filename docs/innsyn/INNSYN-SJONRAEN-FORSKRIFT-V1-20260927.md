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

## 11. V1 tenging í kóða – 27.09.2026

Fyrsta Blönduða sýnin hefur verið útfærð sem prófunarleið `/innsyn/ny` ofan á tímabilsafmarkaða summary-laginu.

Í þessari fyrstu tengingu eru komin:

- haus + truth-state skýring,
- tímabilsval fyrir síðustu 12 mánuði / þetta ár / þennan ársfjórðung / þennan mánuð,
- 2–4 deterministic stjórnendaatriði,
- eitt sameiginlegt SVG-þróunargraf fyrir tekjur, rekstrargjöld og niðurstöðu,
- láréttar sundurliðanir fyrir gjaldalykla og mótaðila,
- banka- og kortacoverage/afstemming sérmerkt frá bókhaldinu.

`Myndræn`, `Tölur` og `Skýring` eru viljandi ekki virkjuð sem fölsk click-target í v1; þau eru merkt sem næstu sýnir þar til sami presentation model er fullnýttur fyrir þau.

V1 á fyrst að sannreyna spurninguna:

> Skil ég reksturinn hraðar hér en á gömlu Innsýn, og get ég treyst því hvaðan hver tala kemur?


## Tímalínugröf og vöntun gagna

- Graf má ekki falla niður í 0 eingöngu vegna þess að valið tímabil nær lengra en síðustu bókuðu færslur.
- Sýnin byrjar við fyrsta mánuð með bókuðum færslum og stoppar við síðasta mánuð með bókuðum færslum innan valda tímabilsins.
- Ef mánuð vantar inni á milli raunverulegra gagnapunkta skal línan rofna; vöntun gagna er ekki túlkuð sem 0.
- Núllpunktur er aðeins teiknaður þegar mánuður hefur raunverulegar bókaðar færslur en viðkomandi mælikvarði er 0.

## Bókuð mánaðarmynd vs. stjórnendaleg rekstrarþróun

Mánaðargrafið má ekki láta óreglulegar reikningsdagsetningar líta út eins og raunverulegt hrun eða stökk í rekstri.

Reglur:

- Bókaðar tekjur, gjöld og niðurstaða haldast óbreytt og rekjanleg eftir raunverulegri bókunardagsetningu.
- Innsýn má bæta við sérmerktum stjórnendalegum trend-lögum sem eru afleidd úr bókuðum gögnum en aldrei sett fram sem ný bókhaldsstaðreynd.
- Fyrsta trend-lagið er **3 mánaða hlaupandi meðaltal af bókaðri niðurstöðu** og birtist sem sérmerkt strikalína.
- Trendlínan skal ekki reiknast yfir mánuð þar sem vantar bókuð gögn; vöntun gagna er ekki jöfnuð út með núlli.
- Skýring undir grafinu skal segja skýrt að trendlínan jafni tímaskekkju vegna óreglulegra reikningsdagsetninga en færi ekki færslur milli tímabila.
- Ef rekstrartímabil verður síðar staðfest sem sjálfstætt gagnasvið má bæta við rekstrartímabilssýn, en aldrei á kostnað upprunalegrar bókunardagsetningar.

## Fyrsta rekjanlega drill-downið – 27.09.2026

V1 fær fyrsta virka drill-downið úr tveimur meginlistum:

- gjaldalykill → mánuðir → mótaðilar → fylgiskjöl,
- mótaðili → mánuðir → gjaldalyklar → fylgiskjöl.

Reglur:

- drill-down notar aðeins bókaðar færslur innan sama valda tímabils,
- heildartala í sundurliðun á að vera rekjanleg til sömu færslna og mynda yfirlitstöluna,
- kredit-/leiðréttingarlínur halda formerki sínu og eru ekki faldar,
- bókað fylgiskjalsnúmer er notað til að opna bókaða fylgiskjalið þegar það er tiltækt,
- breyting á tímabili má varðveita valið drill-down svo stjórnandi geti borið sama atriði saman milli tímabila,
- drill-down breytir ekki bókun og stofnar ekki nýja staðreynd.

## Deterministic einingarverð – 27.09.2026

Innsýn fær sérmerkt lag fyrir einingarverð úr canonical vörulínum.

Reglur:

- útreikningurinn kallar ekki á AI,
- aðeins línur með þekktu magni, studdri mælieiningu og jákvæðu einingarverði/línuverði eru teknar með,
- explicit `unitPrice` hefur forgang; ef það vantar má leiða verð af `lineTotal / quantity` þegar það er ótvírætt,
- kerfið má ekki giska á magn, mælieiningu eða verð,
- ml/cl/l eru normalíseruð í lítra, g/kg í kg, sambærilegar stk.-einingar í stk. og aðrar studdar einingar í sameiginlegan grunn,
- vörulínur eru hópaðar deterministic eftir normalíseruðu vöruheiti + canonical mælieiningu,
- skýr eldsneytisheiti í lítrum eru canonical-uð án AI, t.d. Dísel, Bensín 95, Bensín 98 og almennt Eldsneyti; óljós heiti eru ekki sameinuð,
- ein staðfest dagsetning má sýna **Síðasta þekkta verð**, en hún er ekki kölluð verðþróun,
- verðþróun og prósentubreyting eru aðeins reiknuð þegar minnst tvær **ólíkar dagsetningar** eru til,
- margar sambærilegar línur sama almanaksdag eru sameinaðar í einn tímapunkt með magnvegnu einingarverði, þannig að tvær línur á sama reikningi verði ekki fölsk verðþróun,
- einingarverð er `KNOWN`/þekkt úr vörulínum, ekki `BOOKED` bókhaldsstaðreynd,
- kredit/skil með neikvæðu línuverði eru ekki látin skekkja verðtrend í v1; þau þarfnast sérmeðferðar síðar,
- framtíðarútgáfa má tengja vörulínu við canonical `GlobalProductKnowledge` til að sameina örugglega mismunandi vörulýsingar yfir seljendur.

Markmið stjórnendasýnar:

> Sýna hvort kostnaðarbreyting stafi af magni eða einingarverði, t.d. kr./l, án nýs AI-kalls.

## Deterministic einingarverð – decimal magn og eldsneyti

27.09.2026 kom í ljós á raunverulegri Olís-línu (`Dieselolía sjálfsafgr.`, 26,06 × 218,20 kr.) að eldri POS-vörulínuparser samþykkti aðeins heiltölumagn. Því gat 26,06 l fallið út þó prentað einingarverð og línuheild væru til.

Reglan er nú:

- magn á vörulínu má vera tugabrot;
- skýrt eldsneytisheiti má fá deterministic mælieininguna `l` þegar prentað einingarverð × magn stemmir við prentaða línuheild innan lítils námundunarvikmarks;
- fyrir eldri línur þar sem decimal-magn/mælieining féllu út má Innsýn endurheimta lítramagn úr prentuðu einingarverði og línuheild, en aðeins fyrir ótvíræða eldsneytislínu og aðeins þegar tveggja aukastafa niðurstaða stemmir innan vikmarka;
- þetta kallar ekki á AI og má ekki breyta prentuðu verði eða línuheild;
- nýr parser-version á að valda deterministic endurbyggingu þar sem núverandi refresh-ferli styður hana.

## Rekjanlegt einingarverðs-drill-down – 27.09.2026

Einingarverðskort fá rekjanlega sundurliðun án AI.

Reglur:

- smellur á einingarverð varðveitir valið tímabil og opnar sömu deterministic gagnalínu;
- sýna nýjasta, meðal-, lágmarks- og hámarksverð;
- sýna allar undirliggjandi observation-línur með dagsetningu, seljanda, magni, canonical mælieiningu, einingarverði og varðveittri línuheild;
- merkja hvort einingarverð sé explicit úr varðveittri vörulínu eða derived sem `lineTotal / quantity`;
- opna bókað fylgiskjal/frumleið þegar tenging er tiltæk;
- ekki fela grunsamlega one-off þjónustulínu með heuristic eingöngu. Nota fyrst rekjanleikann til að staðfesta uppruna og bæta síðan deterministic síureglu ef gögn styðja hana.

Markmið:

> Hvert verðpunktur á að vera rekjanlegur frá stjórnendagrafi niður í magn, verð og fylgiskjal án þess að AI búi til skýringu á milli.

## Magn, kostnaður og magnvegið meðalverð – 27.09.2026

Rekjanlegt einingarverðs-drill-down bætir við deterministic rekstrarmælikvörðum úr sömu observation-línum.

Reglur:

- `totalQuantity` er summa canonical magns á völdu tímabili;
- `totalCost` notar varðveitta jákvæða `lineTotal` þegar hún er til, annars `unitPrice × quantity`;
- magnvegið meðalverð er `totalCost / totalQuantity`, ekki einfalt meðaltal verðpunkta;
- mánaðarleg samantekt sýnir magn, línukostnað, magnvegið meðalverð og fjölda raunverulegra dagsetninga;
- ekkert þessara gilda er ný bókhaldsfærsla og ekkert AI-kall er notað;
- prentuð/lestuð línuheild er heimild þegar hún er til, svo námundun á prentuðu einingarverði breyti ekki heildarkostnaði;
- þetta lag er grunnur að síðarri deterministic sundurgreiningu á **verðáhrifum vs. magnáhrifum**.

Markmið:

> Stjórnandi geti séð ekki aðeins hvað einingin kostar, heldur líka hversu mikið var notað og hvort kostnaðarbreyting kemur frá magni eða verði.

## Verðáhrif vs. magnáhrif – deterministic sundurgreining – 27.09.2026

Einingarverðs-drill-down má nú sundurgreina breytingu á heildarkostnaði milli tveggja **samfelldra** mánaða í tvær rekjanlegar stærðir:

- **magnáhrif** – sá hluti kostnaðarbreytingarinnar sem skýrist af breyttu magni,
- **verðáhrif** – sá hluti kostnaðarbreytingarinnar sem skýrist af breyttu magnvegnu meðalverði.

Reglur:

- aðeins tveir samfelldir almanaksmánuðir með gögnum eru bornir beint saman; gat í tímaröð er ekki túlkað sem núll,
- mánaðarlegt meðalverð er áfram `totalCost / totalQuantity`,
- sundurgreiningin er samhverf og deterministic:
  - `magnáhrif = Δmagn × meðaltal(verð_fyrri, verð_seinni)`
  - `verðáhrif = Δverð × meðaltal(magn_fyrri, magn_seinni)`
- með þessari aðferð leggjast magnáhrif og verðáhrif nákvæmlega saman í heildar kostnaðarbreytinguna án sérstaks „interaction“-afgangs,
- prentuð/geymd `lineTotal` er áfram heimild fyrir heildarkostnað,
- ekkert AI-kall er notað,
- engin bókun eða vörulína er færð eða breytt.

Markmið:

> Stjórnandi sjái ekki aðeins að kostnaður hækkaði eða lækkaði, heldur hversu stór hluti breytingarinnar kom frá notkun og hversu stór hluti kom frá verði.

## Mælieiningamiðuð framsetning – 27.09.2026

Deterministic einingarverðsgreiningin skal vera sameiginleg fyrir allar studdar mælieiningar, ekki sérkóðuð fyrir lítra.

Reglur:

- sami útreikningskjarni reiknar heildarmagn, heildarkostnað, vegið meðalverð og verð-/magnáhrif óháð einingu;
- UI-orðalag skal laga sig að canonical einingu svo stjórnandi sjái merkingarbær hugtök, t.d. **Heildartímar/Tímaáhrif** fyrir `klst.` og **Heildarfjöldi/Fjöldaáhrif** fyrir `stk.`;
- `kg`, `kWh`, `km`, `m`, `m²` og `m³` fá sambærilega semantic framsetningu;
- i18n-lagið ber merkinguna; component skal ekki harðkóða íslensk sérheiti fyrir mælieiningar;
- fallback fyrir óþekkta studda einingu er áfram almennt **Magn/Magnáhrif**;
- breyting á orðalagi breytir hvorki vörulínum né bókhaldi og kallar ekki á AI.

Þannig má nota sama rekjanlega kjarna bæði fyrir eldsneytisnotkun, keypta/seldan vinnutíma, vörustykki, hráefnisþyngd, orkunotkun og akstur.

## Einingarverð – sami verðgrunnur og átt færslu

Einingarverðsgreining má ekki blanda saman upphæðum án VSK og með VSK. Þegar prentað/geymt einingarverð er til er línuverðmætið sem Innsýn notar í magn-/verðáhrifum reiknað deterministic sem `magn × einingarverð`. Prentuð línuheild getur áfram verið heimild, en hún má ekki yfirskrifa þennan samræmda verðgrunn ef frumskjal birtir bæði nettó- og brúttóupphæðir.

Innsýn greinir einnig átt bókaðrar línu úr bókuðum reikningslyklum: REVENUE-lína er sala/tekjur, EXPENSE-lína er kaup/kostnaður og óvissa er merkt sem hlutlaust línuverðmæti. Sama vara/þjónusta í sölu og kaupum er ekki sameinuð í eina verðröð.
