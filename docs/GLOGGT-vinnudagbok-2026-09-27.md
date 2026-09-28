# GLÖGGT – vinnudagbók 27. september 2026

**Dagsetning:** sunnudagur 27. september 2026  
**Tímabil:** frá morgni og fram yfir kl. 22:30  
**Meginþemu dagsins:** raunbókun og VSK hjá Sturlu Ólafssyni, bókunarvörn, Innsýn endurhönnun og rekjanleg stjórnendagreining, deterministic einingarverð, eldsneytisgreining, fyrstu skref í afkastahressingu Fylgiskjala og Banka/Visa sýnileiki.

---

## 1. Yfirlit dagsins

Dagurinn byrjaði á raunverulegu bókhaldsvandamáli í Fylgiskjölum hjá Sturlu Ólafssyni og þróaðist síðan yfir í stærsta Innsýn-smíðadag hingað til.

Fyrri hluti dagsins fór í að laga tvær mikilvægar bókhalds-/vinnsluvillur:

1. tvöfalda beitingu 75% innskattsfrádráttar á Nova-reikningi;
2. óskýra production-villu í bókunarvörninni, þar sem væntanleg viðskiptaregla birtist sem `Minified React error #441`.

Eftir hádegi var ný Innsýn-sýn byggð upp í mörgum litlum, öruggum lögum. Þar var farið frá abstrakt presentation-grunni yfir í lifandi stjórnendasýn með tímabilum, bókaðri afkomu, kortagögnum, trendlínu, drill-down og að lokum deterministic einingarverðsgreiningu.

Kvöldið varð sérstaklega afkastamikið í einingarverðum. Úr raunverulegum Olís- og sölureikningsgögnum var staðfest að GLÖGGT getur án nýrra AI-kalla reiknað og sýnt:

- lítra og kr./l;
- heildarmagn;
- magnvegið meðalverð;
- verð- og magnáhrif milli mánaða;
- vinnustundir og kr./klst.;
- stykki og kr./stk.;
- sölu- og kaupátt aðskilda.

Síðla kvölds var svo farið aftur í grunnkerfið: Fylgiskjöl-listinn fékk fyrsta afkastalagið og í Banka fannst að Visa-gögn Sturlu væru til en ósýnileg í Ársgreiningu vegna þess að síðan notaði aðeins `BankTransaction`.

---

# Morgun

## 2. Nova 30.06.2026 – 75% VSK-frádráttur var lagður tvisvar á

Um morguninn kom aftur upp Nova-reikningurinn frá **30.06.2026**, samtals **6.779 kr.**

Fyrir fyrirtækjasértæku blönduðu notkunina hjá Sturlu hafði verið staðfest regla um **75% innskattsfrádrátt**. Réttar tölur voru:

- VSK á reikningi: **1.312 kr.**
- frádráttarbær innskattur, 75%: **984 kr.**
- ófrádráttarbær VSK, 25%: **328 kr.**

### Villan

Eldri handvirk bókun var þegar með sundurliðunina:

- `2520` innskattur: **984 kr.**
- sérstök lína „Ófrádráttarbær VSK“: **328 kr.**

Nýja hlutfallssýnin tók hins vegar **984 kr.** sem væri 100% VSK-grunnurinn og lagði 75% aftur ofan á hann. Þar með sýndi hún ranglega um:

- VSK-grunn **984 kr.**
- frádrátt **738 kr.**
- ófrádráttarbært **246 kr.**

### Lagfæring

`DetectedDocumentEntriesEditor` var breytt þannig að hann þekkir sérstaka debetlínu sem merkir „Ófrádráttarbær VSK“ og endurbyggir 100% VSK-grunninn sem:

**frádráttarbær innskattur + ófrádráttarbær VSK**

Í þessu tilviki:

**984 + 328 = 1.312 kr.**

Server action fyrir VSK-hlutfall var jafnframt styrkt þannig að tvær rekjanlegar leiðir eru studdar:

- `OFFSET`
- `SPLIT_NON_DEDUCTIBLE`

Metadata fyrir `vatDeduction` var hækkað í nýrri útgáfu og geymir nú einnig mode og snapshot-upplýsingar sem þarf til að endurreikna án uppsafnaðrar skekkju.

### Staðfesting

Local-próf og TypeScript komu hreint út. Production-smoke staðfesti síðar réttar tölur:

- **1.312 kr.** VSK
- **984 kr.** frádráttarbært
- **328 kr.** ófrádráttarbært
- **75%**

### Git / production checkpoint

Þessi lota fór í commit:

**`86a7e02` – Stabilize receipt review and VAT partial deduction**

- commit um kl. **10:26**
- push um kl. **10:28**
- Vercel Production varð **Ready**

Þetta varð fyrsti öruggi production-punktur dagsins og leysti af hólmi fyrri checkpoint `d002e9e`.

---

## 3. Bókunarvörn – production React #441

Næsta vandamál kom upp við raunbókun á **Midgard Restaurant & Bar**, dagsett **06.07.2026**, samtals **14.670 kr.**

Bókunarvörnin ætlaði réttilega að hindra bókun vegna eldri óafgreidds skjals, en production sýndi notandanum aðeins:

**Minified React error #441**

### Orsök

`approveDetectedDocument` notaði `throw Error(...)` með viðskiptareglustrengjum eins og:

- `OLDER_UNBOOKED`
- `POSSIBLE_DUPLICATE`

Þetta var notað sem flutningsleið yfir Server Action mörkin. Í production huldi React/Next hins vegar raunverulegu villuskilaboðin.

### Lagfæring

Væntanleg viðskiptaskilyrði eru nú gripin inni í server action og skilað sem serializable structured result.

`ApproveDocumentButton` getur þar með sýnt notandanum skýrt:

- af hverju bókun stöðvaðist;
- hvaða eldra skjal blokkar;
- hnapp til að opna eldra skjalið;
- eða „Bóka samt“ þar sem sú leið á við.

Óvæntar kerfisvillur halda áfram að kastast áfram svo alvöru villur felist ekki sem venjuleg viðskiptaregla.

---

## 4. Bílanaust / Krúsi og tímaröð bókunar

Í raunbókhaldinu kom upp **Bílanaust-reikningur 06.07.2026, 7.870 kr.**, sem var stílaður á **Krúsa ehf.** en lá inni í umhverfi Sturlu.

Ákvörðun dagsins var að **ekki bóka hann strax** og ekki reyna að giska á skýringuna. Beðið verður eftir upplýsingum frá Sturlu.

Skjalið var því sett til hliðar / merkt þannig að það þarfnist athygli.

Þetta leiddi í ljós tvö vandamál í chronology guard:

1. skjal sem var sett til hliðar gat áfram blokkað yngri skjöl;
2. tvö skjöl með sömu sýnilegu dagsetningu gátu talist „eldra“ og „yngra“ vegna undirliggjandi tímastimpla.

### Lagfæring

Bókunarvörnin var breytt þannig að:

- `AiDetectedDocument` með `needsAttentionAt != null` blokkar ekki;
- `Receipt` í `NEEDS_ATTENTION` blokkar ekki;
- samanburður á eldri/yngri miðast við almanaksdag en ekki nákvæman timestamp.

Þannig getur Bílanaust 06.07. verið sett til hliðar án þess að Midgard 06.07. lokist inni.

Raunverulega eldri óafgreitt skjal á hins vegar áfram að stöðva bókun.

---

# Fyrri hluti síðdegis – Innsýn fær nýjan grunn

## 5. Ákvörðun: „fyrst kortið, síðan húsið“

Eftir bókhaldsvinnuna færðist fókusinn yfir í Innsýn.

Við staðfestum aftur kjarnahugsunina:

- **Reksturinn → Innsýn**
- **Gögn fyrst, AI síðan**
- Innsýn er stjórnendasýn, ekki bara bókhaldsskýrslusíða
- sannleikslög:
  - **Bókað**
  - **Þekkt**
  - **Bíður staðfestingar**
- ein greiningarvél, margar framsetningar:
  - **Blönduð**
  - **Myndræn**
  - **Tölur**
  - **Skýring**
- drill-down á alltaf að ná aftur í sönnunargögn / frumskjal.

Ákveðið var að ekki halda áfram að bæta við gömlu, mjög stóru `app/innsyn/page.tsx`, heldur byggja nýjan bounded summary/presentation grunn samhliða.

---

## 6. Fyrsti Innsýn presentation-grunnurinn

Um **14:57** var fyrsta nýja grunnlagið komið:

### `presentation-model.ts`

Skilgreindi meðal annars:

- `InsightTruthState`
- `InsightViewMode`
- period presets
- evidence contracts
- narrative
- series
- breakdown
- attention
- PaymentCard reconciliation summary
- `InsightPresentationModel`

### `period.ts`

Tímabilskerfi fyrir:

- mánuð
- ársfjórðung
- ár
- síðustu 12 mánuði
- custom tímabil

og jafnlanga comparison-period.

Mikilvægt: **2026 er ekki hardcode-regla**.

### `booked-summary.ts`

Pure deterministic samantekt úr bókuðum færslum:

- tekjur úr REVENUE;
- gjöld úr EXPENSE;
- VSK input/output;
- mánaðarserie;
- sundurliðun eftir gjaldalykli og mótaðila.

### `card-summary.ts`

Fyrsti deterministic summary-grunnur fyrir kortafærslur og afstemmingarstöðu.

### Skjöl / handbók

Samhliða var byrjað að móta og uppfæra:

- `docs/innsyn/INNSYN-KORT-OG-ARKITEKTUR-20260927.md`
- `docs/innsyn/INNSYN-SJONRAEN-FORSKRIFT-V1-20260927.md`
- `docs/leidbeiningar/innsyn/INNSYN.md`

Þetta festi jafnframt þá vinnureglu að kennslubæklingur eigi að uppfærast með kóðanum, ekki löngu síðar.

---

## 7. `loadInsightSummary` – tímabilsafmörkuð gögn

Um **15:10** kom næsta lag:

### `loadInsightSummary(companyId, period)`

Markmiðið var að sækja aðeins:

- valið tímabil;
- samanburðartímabil;
- þær staðreyndir sem fyrsta stjórnendasýnin þarf.

Ekki alla bankasögu eða öll gögn fyrirtækisins.

Nýtt `bank-summary.ts` reiknar deterministic:

- fjölda færslna;
- brúttó innstreymi;
- brúttó útstreymi;
- nettó peningaflæði;
- óafstemmdar færslur;
- absolute óafstemmt verðmæti.

Kortasamantekt var styrkt þannig að endurgreiðslur eyðileggi ekki coverage-tölur.

### Mikilvæg tvítalningarvörn

AI-skjöl eru lesin úr:

`AiDetectedDocument.bookingEntries`

Handvirk Receipt-færsla er aðeins notuð í viðeigandi tilfellum.

Ástæðan er að eitt frumskjal getur innihaldið mörg greind undirskjöl; það má ekki rugla saman dagsetningum/mótaðilum eða telja bæði parent og undirskjal.

---

## 8. Commit `341cda0` – Innsýn foundation + booking guard

Á öruggum checkpoint voru valdar skrár staged sérstaklega, ekki `git add .`, vegna þess að working tree inniheldur fjölda eldri deletion/untracked rannsóknarskráa.

Commitið varð:

**`341cda0` – Add Insight foundation and improve booking guard**

Það innihélt 13 valdar skrár, meðal annars:

- `app/actions/receiptActions.ts`
- `app/innsyn/_lib/booked-summary.ts`
- `app/innsyn/_lib/card-summary.ts`
- `app/innsyn/_lib/period.ts`
- `app/innsyn/_lib/presentation-model.ts`
- `components/ApproveDocumentButton.tsx`
- bókunarvörn/tímaröð docs
- Innsýn arkitektúr og sjónræna forskrift
- kennslubækling.

Commitið var push-að á `main` og Vercel sýndi **Ready / Production**.

Þetta varð stöðugur production-checkpoint áður en síðari Innsýn-tilraunir dagsins héldu áfram local.

---

# Síðdegi – fyrsta lifandi Blönduð Innsýn

## 9. `/innsyn/ny`

Um **15:21** kom fyrsta nýja UI-ið:

**`/innsyn/ny`**

Gamla `/innsyn` var látin óbreytt til öryggis.

Blönduð sýn fékk:

- stjórnendafrásögn;
- tekjur;
- rekstrargjöld;
- niðurstöðu;
- tímabilsval;
- samanburð;
- mánaðarlegt þróunargraf;
- helstu gjaldalykla;
- stærstu mótaðila;
- Banka og Visa sem sérmerkt sannleikslag.

Í raunprófi Sturlu sýndi sýnin meðal annars:

- tekjur: **5.050.000 kr.**
- rekstrargjöld: **1.310.450 kr.**
- niðurstaða: **3.739.550 kr.**
- **472 kortafærslur**, samtals **6.533.452 kr.**, sem biðu afstemmingar.

Meðal stærstu gjaldalykla komu fram:

- 4910 Veitingakostnaður
- 4710 Eldsneyti og hleðsla
- 4960 Annar kostnaður
- 4730 Varahlutir og hjólbarðar
- 4120 Tölvu- og skrifstofubúnaður
- 4530 Tryggingagjald

Olís var stærsti mótaðili í kostnaðargögnum.

---

## 10. Grafið – ekki búa til falskt núll

Um **15:33** var fyrsta mikilvæga sjónræna leiðréttingin gerð.

Upphaflega teiknaði grafið alla valda 12 mánuðina og lét tóma mánuði falla niður í núll. Þetta gaf ranga mynd.

Ný regla:

- graf byrjar við fyrsta mánuð með raunverulegum bókuðum gögnum;
- stoppar við síðasta mánuð með gögnum;
- tómur mánuður inni á milli verður **gat**, ekki tilbúið núll;
- raunverulegur gagnamánuður má auðvitað hafa 0 í tilteknum mælikvarða.

Þetta var staðfest sjónrænt hjá Sturlu: grafið stoppaði við ágúst í stað þess að falla tilbúið niður í september.

---

## 11. Apríl – bókhaldsmynd vs. stjórnendamynd

Grafið leiddi í ljós að apríl leit út eins og reksturinn hefði hrunið.

Við skoðuðum tekjufærslurnar og sáum að:

- mars var með stóra tekjufærslu;
- apríl með kostnað en enga sambærilega bókaða tekjufærslu;
- næsta stóra tekjufærsla kom í byrjun maí.

Niðurstaðan var ekki að færa tekjur milli mánaða. Bókaður sannleikur verður að standa.

En stjórnendasýn má hjálpa notanda að sjá undirliggjandi þróun.

### Ný regla

Innsýn fékk:

**„Rekstrarþróun (3 mán.)“**

- 3 mánaða hlaupandi meðaltal af bókaðri niðurstöðu;
- byrjar aðeins þegar þrír raunverulegir gagnamánuðir liggja fyrir;
- reiknast ekki yfir gagnagat;
- er sérmerkt sem stjórnendaleg trend-lína;
- breytir ekki bókuðum staðreyndum.

Sjónræna prófið sýndi að fjólublá trend-lína mýkti apríl-frávikið án þess að falsa apríltekjur.

---

## 12. Drill-down v1

Um **15:54** varð fyrsta rekjanlega sundurliðunin virk.

Notandi getur smellt á:

- gjaldalykil, t.d. **4910 – Veitingakostnaður**;
- mótaðila, t.d. **Olís**.

Drill-down sýnir síðan:

- sama bókaða heild;
- þróun eftir mánuðum;
- gagnstæða vídd;
- einstök fylgiskjöl;
- tengingu niður í bókað fylgiskjal.

Þannig varð rekjanleikakeðjan raunveruleg:

**heild → sundurliðun → færslur → fylgiskjal → frumgagn**

---

# Seinni hluti síðdegis – einingarverð án AI

## 13. Hugmyndin: Innsýn eigi að sjá verð á einingu

Í framhaldinu kom spurning hvort GLÖGGT gæti fylgst með t.d. **verði á lítra**.

Ákvörðunin varð stærri almenn hönnunarregla:

Innsýn á að geta unnið deterministic með:

- kr./l
- kr./stk.
- kr./kg
- kr./kWh
- kr./klst.
- kr./km
- m, m², m³

þegar staðfest vörulína inniheldur næg gögn.

AI á ekki að reikna stærðfræðina. AI kemur aðeins inn ef textinn eða merking vörunnar er óljós.

---

## 14. Einingarverð v1

Um **16:59** kom fyrsta `unit-price.ts` lagið.

Það les staðfestar / varðveittar vörulínur og notar:

- magn;
- mælieiningu;
- explicit einingarverð;
- eða deterministic `lineTotal / quantity` þegar það er öruggt.

Kerfið normalíserar mælieiningar og sleppir línu frekar en að giska ef gögn vantar.

Fyrsta sjónræna niðurstaðan sýndi þjónustulínur eins og:

- Eldvarnareftirlit og verkefnastýring – 10.000 kr./klst.
- Aukaverk – 50.000 kr./stk.

En eldsneytið vantaði enn.

---

## 15. Eldsneytis-canonicalization og tímaröð

Um **17:15** var einingarverðslagið styrkt:

- skýr `Dísel / Diesel / Disel` heiti sameinast deterministic;
- Bensín 95 og Bensín 98 geta canonicalast;
- margar sambærilegar línur sama dag teljast einn tímapunktur;
- aðeins ein dagsetning birtist sem „Síðasta þekkta verð“;
- raunverulegt trend/prósentubreyting þarf minnst tvær dagsetningar.

Ekkert nýtt AI-kall og engin Prisma-breyting.

---

# Kvöld – Olís verður full deterministic einingarverðsgreining

## 16. Raunveruleg Olís-lína fann parser-villu

Við fórum niður í raunverulegt Olís-frumskjal.

Dæmið sýndi:

- **Dieselolía sjálfsafgr.**
- vörunr. **00415**
- einingarverð **218,20 kr./l**
- magn **26,06 l**
- línuheild **5.686 kr.**

Þetta sannaði að frumskjalið hafði allar upplýsingar sem Innsýn þurfti.

### Orsök þess að eldsneytið hafði ekki birst

Eldri deterministic POS-parser samþykkti aðeins **heiltölu magn**.

Þar sem magn var `26,06` datt quantity út.

### Lagfæring um 20:42

- decimal quantity leyft;
- skýr fuel-lína fær `unit="l"` þegar verð × magn stemmir við línuheild innan vikmarka;
- parser-version hækkað;
- backward-compatible fallback getur endurheimt lítramagn úr eldri línu ef explicit verð og línuheild eru til og niðurstaðan stemmir innan vikmarka;
- engin AI-þörf.

---

## 17. Díselkortið varð lifandi

Eftir lagfæringuna birtist raunveruleg deterministic díselgreining hjá Sturlu:

- **24 dagsetningar**
- **25 vörulínur**
- nýjasta verð: **234,4 kr./l**
- meðalverð á þeim tímapunkti: um **231,97 kr./l**
- verðbreyting frá fyrri mælingu: **−4,6%**

Þetta var fyrsta skýra production-like sönnunin fyrir að GLÖGGT geti fylgst með raunverulegu einingarverði úr bókhaldsgögnum án nýrra AI-kalla.

---

## 18. Einingarverð drill-down

Um **20:52** urðu einingarverðskort smellanleg.

Dísel-drill-down sýndi fyrir hverja línu:

- dagsetningu;
- seljanda;
- magn;
- einingarverð;
- línuheild;
- hvort verðið væri prentað eða deterministic afleitt;
- tengingu niður í fylgiskjal.

Raunprófið sýndi m.a. röð Olís-kaupa í ágúst með magni frá um 26–63 lítrum og verðpunktum á bilinu um 215–246 kr./l.

---

## 19. Heildarmagn, heildarkostnaður og mánaðarleg notkun

Um **21:01** bættist við stærri samantekt.

Díselgreiningin hjá Sturlu sýndi:

- **1.098,18 l** heildarmagn
- **254.747 kr.** heildarkostnað
- **231,97 kr./l** magnvegið meðalverð

Mánaðarsýn sýndi meðal annars:

- apríl: 54,75 l / 15.000 kr.
- júní: 196,45 l / 47.565 kr.
- júlí: 285,11 l / 62.463 kr.
- ágúst: 561,87 l / 129.719 kr.

Þetta gaf strax stjórnendalega mynd af notkun og verðbreytingu.

---

## 20. Hvað breyttist og af hverju? – magnáhrif vs. verðáhrif

Um **21:09** var bætt við deterministic sundurgreiningu á kostnaðarbreytingu.

Fyrir júlí → ágúst gat kerfið skipt breytingunni í:

- heildar kostnaðarbreytingu;
- magnáhrif;
- verðáhrif;
- magnbreytingu;
- breytingu á magnvegnu meðalverði.

Á Sturlu-díselgögnunum var meginhluti hækkunarinnar frá júlí í ágúst vegna **meira magns**, ekki fyrst og fremst hærra verðs.

Þetta er ein af lykilniðurstöðum dagsins: Innsýn getur ekki bara sagt að kostnaður hafi hækkað, heldur **af hverju** hann hækkaði, deterministic.

---

## 21. Sami kjarni gerður almennur – klst., stk., kg, kWh, km…

Um **21:20** var semantic framsetningin alhæfð.

Dæmi:

- `klst.` → Heildartímar / Tímaáhrif
- `stk.` → Heildarfjöldi / Fjöldaáhrif
- `kg` → Heildarþyngd
- `kWh` → Heildarnotkun
- `km` → Heildarkílómetrar / Akstursáhrif

Sama stærðfræðilag helst undir húddinu.

Ákveðið var að prófa `kg`, `kWh` og `km` síðar þegar raunveruleg Benedikt-gögn gefa slík dæmi, ekki búa til gervigögn núna.

---

## 22. Klst.-próf fann VSK/verðgrunnsvillu

Prófun á **Eldvarnareftirlit og verkefnastýringu** fann mikilvæga villu.

Kerfið hafði blandað saman:

- línuheild **með VSK** úr einu skjali;
- línuheild **án VSK** úr öðru.

Þar með varð meðalverðið ranglega um **11.115 kr./klst.**, þó explicit einingarverð væri stöðugt **10.000 kr./klst.**

### Lagfæring um 21:27

Ný canonical regla:

- ef explicit einingarverð er til, þá er greiningarverðmæti línu:

**magn × einingarverð**

- línuheild er fallback þegar einingarverð er afleitt;
- sala og kaup eru aðgreind út frá bókuðum REVENUE/EXPENSE lyklum;
- sala og kaup á sömu vöru/þjónustu blandast ekki saman;
- UI segir „Heildartekjur“ fyrir sölu og „Heildarkostnaður“ fyrir kaup.

### Staðfest raunpróf – klukkustundir

Eftir lagfæringu sýndi sýnin rétt:

- **142 klst.**
- **1.420.000 kr. heildartekjur**
- **10.000 kr./klst.** vegið meðalverð
- júlí: 66 klst. / 660.000 kr.
- ágúst: 76 klst. / 760.000 kr.
- tekjubreyting: **+100.000 kr.**
- tímaáhrif: **+100.000 kr.**
- verðáhrif: **0 kr.**

Þetta sýnir að tekjuaukningin kom eingöngu vegna fleiri vinnustunda.

---

## 23. Stk.-próf – Aukaverk

Sami kjarni var prófaður á **Aukaverk**.

Rétt niðurstaða:

- **2 stk.**
- **100.000 kr. heildartekjur**
- **50.000 kr./stk.** vegið meðalverð
- júlí 1 stk. / 50.000 kr.
- ágúst 1 stk. / 50.000 kr.
- tekjubreyting 0
- fjöldaáhrif 0
- verðáhrif 0

Þar með var sami deterministic kjarni raunprófaður á þremur ólíkum mælieiningum:

1. **lítrar**
2. **klukkustundir**
3. **stykki**

---

# Rekstrar-/viðskiptahugmyndir um kvöldið

## 24. Umfang bókhalds Sturlu og verðlagning fylgiskjala

Í umræðu um raunvinnuna kom fram að frá fylgiskjali 486 að 634 eru um **148 skjöl** hjá Sturlu núna, einkum vegna mikils fjölda Olís- og Nova-skjala auk venjulegra fylgiskjala.

Við reiknuðum:

- 5 mínútur × 148 = **740 mínútur**
- sem eru **12 klst. og 20 mínútur**

Ef rukkað væri 1.000 kr. á skjal væru það **148.000 kr.**, sem var metið of hátt fyrir þessa tegund magnvinnslu.

Umræðan leiddi að því að einföld, endurtekin skjöl þurfi að verða mjög ódýr í vinnslu þegar GLÖGGT er fullþjálfað, á meðan flóknari skjöl geta borið annað verð eða tímagjald.

---

## 25. Sala – lögleg lágmarksútgáfa rædd

Síðla kvölds var einnig rætt að nálgast þyrfti **GLÖGGT Sala**.

Meginhugsun fyrir síðar:

- append-only söludagbók;
- samfelldar númeraraðir;
- kvittanir/reikningar;
- VSK-sundurliðun;
- kredit/bakfærslur í stað þess að breyta gamalli sölu;
- daglokun og greiðslumátar;
- audit trail;
- sjálfvirk bókun yfir í GLÖGGT;
- kerfislýsing og lögleg rekjanleiki.

Ákvörðun var þó að **andlitsuppfærsla og afkastahressing núverandi kerfis komi fyrst** áður en ný stór Sala-eining er smíðuð.

---

# Síðla kvölds – afköst og Banki

## 26. Fylgiskjöl – fyrsta afkastalagið

Um **22:08** hófst næsta aðalverkefni: hraða-/andlitsuppfærsla kerfisins.

Fyrsta markið var `/fylgiskjol` listinn.

### Vandamál

Listinn sótti áður öll `Receipt` sem voru ekki APPROVED ásamt **öllum** `AiDetectedDocument` undirskjölum og síaði síðan afgreidd skjöl út í JavaScript.

Þetta er sérstaklega dýrt þegar eitt PDF inniheldur mjög mörg undirskjöl.

### Ný leið

Tvær afmarkaðar fyrirspurnir eru keyrðar samhliða:

1. aðeins óafgreidd greind undirskjöl sem mega birtast;
2. aðeins handvirk/ógreind Receipt sem hafa engin AI-undirskjöl.

Bókunar-, VSK-, learning- og disposition-reglur voru ekki breyttar.

`npx tsc --noEmit` kom aftur að prompt án villu áður en staged var.

### Git-staða við dagslok

Fyrir þessa bót voru **nákvæmlega tvær skrár staged**:

- `app/fylgiskjol/page.tsx`
- `docs/fylgiskjol/LESTU-MIG-FYLGISKJOL-LISTI-AFKOST-V1-20260927.txt`

Working tree hafði áfram fjölda vísvitandi local deletion/untracked rannsókna og Innsýn-skráa sem voru **ekki staged**.

**Mikilvægt:** í tiltækri dagsstöðu er ekki staðfest að þetta Fylgiskjöl-commit hafi verið klárað/pushað áður en umræðan færðist yfir í Banka. Það þarf að staðfesta fyrst næst.

---

## 27. Banki – tvö Visa-yfirlit voru til en Ársgreining sýndi „engin gögn“

Rétt fyrir lok dags var Banki opnaður hjá Sturlu.

Notandinn bjóst við upplýsingum því **tvö Visa-yfirlit** höfðu verið flutt inn.

Ársgreining sýndi hins vegar:

**„Engar bankafærslur fundust fyrir þetta ár.“**

og allir flipar litu út fyrir að vera tómir.

### Greining

Vandamálið var ekki að kortagögnin vantaði.

Innsýn hafði þegar sýnt:

- **472 kortafærslur**
- samtals **6.533.452 kr.**

Ársgreining Banka notaði hins vegar aðeins `BankTransaction` og féll strax í empty-state ef bankafærslur voru engar.

`PaymentCardTransaction` var því til en ósýnilegt í þessari sýn.

### Ný Banka-lagfæring – búin til en ekki enn staðfest í notendaprófi

Overlay var útbúið þannig að:

- áraval tekur mið af BankTransaction **og** PaymentCardTransaction;
- kortagögn fá sérstakt lag;
- sýna á:
  - fjölda innfluttra yfirlita/skráa;
  - fjölda kortafærslna;
  - kaup/úttektir;
  - inneignir/greiðslur;
  - óafstemmdar færslur;
  - tímabil;
  - kort með gögnum;
  - stærstu söluaðila.

Mikilvæg regla:

**Kortagögn eru ekki lögð saman við bankapeningaflæði**, svo þau tvíteljist ekki þegar bankayfirlit Sturlu berast síðar.

### Staða

Pakkinn:

`GLOGGT-BANKI-KORTAGOGN-ARSGREINING-FIX-20260927.zip`

var útbúinn, en við dagslok hafði notandi **ekki enn staðfest innsetningu, `tsc` eða sjónrænt smoke-test** á þessari Banka-breytingu.

---

# 28. Mikilvægar hönnunarreglur sem festust í dag

Dagurinn skilaði nokkrum almennum reglum sem eiga að lifa áfram í GLÖGGT:

### Innsýn

- bókaður sannleikur má aldrei breytast bara til að gera graf fallegra;
- stjórnendatrend má túlka en verður að vera merkt sérstaklega;
- tóm gögn eru ekki núll;
- heild → drill-down → frumgagn;
- einingarverð byggist á staðfestum vörulínum;
- explicit verð er sterkara verðgrunnsgagn en óljós línuheild;
- sala og kaup má ekki blanda saman í sömu einingarverðsserie;
- magn- og verðáhrif eiga að vera deterministic;
- AI er ekki reiknivél fyrir gögn sem stærðfræði og reglur geta leyst.

### Fylgiskjöl

- skjöl sett til hliðar mega ekki blokka eðlilegt bókunarflæði;
- skjöl sama almanaksdags eiga ekki að blokka hvert annað vegna timestamp-smámunar;
- listi á aðeins að sækja þau gögn sem þarf til að sýna listann.

### Banki

- parser/innflutningsreglur eru almennar;
- gögn eru fyrirtækjasértæk;
- Visa/kort og banki eru aðskilin sannleikslög þar til afstemming tengir þau;
- ekki tvítelja kortakaup og kortagreiðslu þegar bankayfirlit koma.

---

# 29. Git / deployment staða við dagslok

## Staðfest production í dag

### `86a7e02`
**Stabilize receipt review and VAT partial deduction**

- push-að á `main`
- Vercel Production Ready
- VSK 75% raunpróf staðfest.

### `341cda0`
**Add Insight foundation and improve booking guard**

- commit-að og push-að á `main`
- Vercel Production Ready
- fyrsti Innsýn presentation/period/booked/card grunnurinn og booking guard checkpoint.

## Local eftir `341cda0`

Stór hluti Innsýn-vinnu síðdegis/kvölds var áfram local, þar á meðal:

- `/innsyn/ny`
- load summary
- mixed view
- grafgagnamörk
- rekstrartrend
- drill-down
- unit price
- fuel decimal quantity
- unit-price drill-down
- magn/kostnaður
- verð/magn áhrif
- almennar mælieiningar
- verðgrunnur og sale/purchase átt
- tilheyrandi docs/kennslubæklingur.

Þessi vinna var prófuð í UI í mörgum raunskrefum, en á ekki að teljast production-checkpoint fyrr en staged/committed/pushed sérstaklega.

## Fylgiskjöl performance

Tvær skrár staged við síðustu sýnilegu Git-stöðu. Commit/push þarf að staðfesta næst.

## Banki kortagögn

Overlay tilbúið en innsetning/próf ekki staðfest við dagslok.

---

# 30. Næsti öruggi upphafspunktur á morgun

Á morgun er eðlilegast að byrja á stöðustaðfestingu áður en ný smíði hefst:

1. **`git status`** – staðfesta hvort Fylgiskjöl performance-commit var klárað eða hvort tvær skrár séu enn staged.
2. Staðfesta Vercel-status fyrir síðasta push sem fór í gegn.
3. Gera **sérstakt Innsýn checkpoint commit** með eingöngu þeim Innsýn/lib/docs skrám sem tilheyra vinnu dagsins; ekki `git add .`.
4. Setja inn og prófa Banka-kortagagnafixið:
   - `npx tsc --noEmit`
   - Banki → Ársgreining hjá Sturlu
   - staðfesta að tvö Visa-yfirlit / 472 kortafærslur verði sýnileg sem kortagögn þó BankTransaction sé enn tómt.
5. Halda síðan áfram með fyrirhugaða **andlitslyftingu + hraðaaukningu**, næst á `/fylgiskjol/[id]` review-síðunni.

---

# 31. Dagsniðurstaða

27. september varð ekki bara dagur þar sem nokkrar villur voru lagaðar. Hann færði GLÖGGT áfram á þremur stórum sviðum:

1. **Bókhaldsöryggi** – VSK-hlutfall, booking guard og chronology urðu traustari.
2. **Innsýn** – fór úr hugmynd/forskrift yfir í lifandi stjórnendagreiningu sem getur útskýrt þróun, drill-að niður í fylgiskjöl og greint magn/verð án AI.
3. **Afköst og sameiginleg gagnanotkun** – fyrsta Fylgiskjöl-afkastalagið var undirbúið og Banki-vandinn sýndi skýrt að sama fyrirtækjagagn á að vera sýnilegt í fleiri en einni greiningarsýn án þess að vera tvítalið.

Sterkasta tæknilega sönnun dagsins er líklega þessi:

> Úr raunverulegum Olís-kvittunum gat GLÖGGT, án nýrra AI-kalla, endurheimt og greint lítramagn, lítraverð, heildarnotkun, magnvegið verð og skipt kostnaðarbreytingu í magn- og verðáhrif – og sami kjarni virkaði síðan óbreyttur á vinnustundir og stykkjaverð.

Þetta er mjög skýr staðfesting á kjarnareglunni:

**Gögn fyrst, AI síðan.**

