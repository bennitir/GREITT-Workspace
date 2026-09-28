# GLÖGGT Innsýn – kort og arkitektúr

Dagsetning: 27.09.2026  
Staða: hönnun og fyrsti öruggi arkitektúrgrunnur – **ekki enn ný production-sýn**.

## 1. Af hverju Innsýn er til

Upprunavandamálið er ekki skortur á bókhaldsgögnum heldur bilið milli gagna og stjórnendaskilnings.

Staðfest stefna úr vinnudagbók GLÖGGT:

> Gögn eru ekki það sama og upplýsingar. Upplýsingar eru ekki það sama og skilningur. Innsýn á að brúa bilið.

Innsýn á því að hjálpa stjórnanda að svara:

- Hvernig gengur reksturinn?
- Er reksturinn að skila afkomu?
- Hvað hefur breyst?
- Hvað skýrir breytinguna?
- Hvað er framundan?
- Hvað þarfnast athygli?
- Hvaða gögn liggja að baki niðurstöðunni?

Hún tekur ekki ákvörðunina fyrir stjórnandann.

## 2. Staðfestar hönnunarreglur

### 2.1 Reksturinn → Innsýn

Innsýn er ekki aukaskýrsla undir Bókhaldi. Hún er skilningslag yfir rekstrinum.

Gagnauppsprettur geta meðal annars verið:

- Bókhald og fylgiskjöl,
- Banki,
- greiðslukort/VISA,
- Sala,
- Laun,
- Verk,
- Vinnustundir,
- samningar,
- `InsightEntity`, `InsightFact` og `FinancialEvent`.

### 2.2 Gögn fyrst, AI síðan

Röðin er:

1. staðfest frumgögn,
2. deterministic útreikningur og reconciliation,
3. mynstur/frávik sem gögnin styðja,
4. AI aðeins þar sem túlkun eða mannamál bæta raunverulega virði.

AI má ekki búa til bókhaldsstaðreynd eða fela óvissu.

### 2.3 Þrjú sannleikslög

Öll framsetning þarf að geta aðgreint:

- **Bókað** – staðfest bókhaldsáhrif,
- **Þekkt** – staðreynd úr skjölum, samningum, banka, korti o.fl.,
- **Bíður staðfestingar** – þekkt möguleg áhrif sem mega ekki líta út eins og bókun.

Þetta er ekki aðeins UI-merki; þetta þarf að fylgja gögnunum niður í drill-down.

### 2.4 Ein greiningarvél – margar sýnir

Staðfest hugmynd að sýnarofa:

`Blönduð | Myndræn | Tölur | Skýring`

Sýnirnar mega ekki reikna sitt hvora niðurstöðu. Þær lesa sama presentation model og sömu sönnunargögn.

### 2.5 Fyrst heildarmynd, síðan sönnunargögn

Fyrsta sýn á að svara „hvað er að gerast?“ á nokkrum sekúndum.

Drill-down á síðan að geta farið:

`heildarmynd → flokkur → mótaðili/undirflokkur → færslusafn → bankafærsla/kortafærsla/fylgiskjal → frumskjal`

Kjarnaspurningar drill-down:

- Hvað vitum við?
- Hvað bendir til einhvers?
- Hvað vitum við ekki?
- Hvaðan kemur niðurstaðan?

## 3. Staða kóðans 27.09.2026

Núverandi `app/innsyn/page.tsx` er um 3.700 línur og vinnur of mörg hlutverk í einni skrá:

- aðgangsstýring,
- i18n,
- gagnaöflun,
- business-reglur,
- aggregation,
- bankagreining,
- formatting,
- UI.

Hún sækir meðal annars:

- fyrirtæki og bókhaldslykla,
- öll fylgiskjöl með bókunarlínum,
- `InsightEntity`,
- `InsightFact`,
- `FinancialEvent`,
- vinnslujobs,
- bankareikninga og bankafærslur.

Núverandi síða byggir einnig ársbankagreiningu við opnun. Eldri afkostaúttekt hafði þegar bent á að aðalsíðan ætti að fá sérstakt summary/gagnalag og að bankagögn yrðu valin eftir tímabili/lazy/cached í stað þess að lesa alla söguna.

## 4. Undirliggjandi gagnagrunnur sem á að endurnýta

Ekki endurbyggja það sem er þegar til.

### Innsýn-kjarni

- `InsightEntity`
- `InsightEntityRelation`
- `InsightEntityAccountLink`
- `InsightFact`
- `FinancialEvent`
- `FinancialEventScheduleItem`
- `FinancialEventRelation`
- `FinancialEventEntity`
- `DocumentEntityLink`
- `DocumentFinancialEvent`
- `InsightProcessingJob`
- `InsightProcessingItem`

### Banki

Endurnýta deterministic greiningu úr:

- `app/banki/_lib/analysis/transactions.ts`
- `app/banki/_lib/analysis/annual.ts`
- `app/banki/_lib/analysis/annual-statement.ts`

### Greiðslukort

`PaymentCard` og `PaymentCardTransaction` eru þegar til og kortayfirlit geta varðveitt meðal annars:

- dagsetningu,
- merchant texta,
- merchant category,
- erlenda fjárhæð,
- gjaldmiðil,
- gengi,
- ISK-fjárhæð,
- skýringu,
- kortatímabil,
- hrá gögn,
- afstemmingarstöðu.

Núverandi Innsýn les ekki `PaymentCardTransaction`. Það er fyrsta skýra glufan sem næsta Innsýn-lag þarf að loka.

## 5. Nýja lagaskiptingin

Markmiðið er að `page.tsx` verði fyrst og fremst composition/rendering, ekki greiningarvél.

```text
Frumgögn
  ├─ bókun/fylgiskjöl
  ├─ bankafærslur
  ├─ kortafærslur
  ├─ InsightFacts / Entities / FinancialEvents
  └─ síðar Sala / Laun / Verk / Vinnustundir / samningar
        ↓
Deterministic domain analysis
        ↓
Reconciliation + truth state
        ↓
Innsýn summary/presentation model
        ↓
Blönduð | Myndræn | Tölur | Skýring
        ↓
Drill-down / evidence
```

## 6. Fyrsti tæknigrunnur

Nýtt samningslag undir `app/innsyn/_lib` skilgreinir nú fyrst:

- `InsightTruthState`
- `InsightViewMode`
- `InsightPeriodPreset`
- `InsightPeriod`
- evidence-link contract,
- narrative contract,
- time-series contract,
- breakdown contract,
- attention contract,
- kortaafstemmingarsamantekt,
- `InsightPresentationModel`.

Þessi contracts **ákveða ekki bókhaldsstaðreyndir**. Þau taka aðeins við niðurstöðum frá deterministic lögum.

Einnig er kominn hreinn tímabilshelper fyrir:

- þennan mánuð,
- síðasta mánuð,
- þennan ársfjórðung,
- þetta ár,
- síðasta ár,
- síðustu 12 mánuði,
- sérvalið tímabil,
- samanburð við jafnlöng fyrra tímabil.

Þetta fylgir fyrri ákvörðun um að `2026` eigi ekki að vera hardcode-regla.

Fyrsti deterministic samantektarkjarninn er einnig kominn sem pure föll:

- `booked-summary.ts` reiknar bókaðar tekjur, gjöld, niðurstöðu, inn-/útskatt, mánaðarserie og sundurliðun eftir gjaldalykli og mótaðila. Hann fylgir sömu formerkjum og núverandi Innsýn: tekjur `credit - debit`, gjöld `debit - credit`.
- `card-summary.ts` reiknar tímabilssamantekt greiðslukorta eftir afstemmingarstöðu. Núverandi kortainnflutningur setur færslur sem `UNRECONCILED`, þannig að afstemmingarworkflow þarf að koma áður en „afstemmt“ verður lifandi stjórnendatala.

Bæði föllin eru gagnagrunnslaus og auðprófanleg. Loader-lagið á síðar að sækja aðeins tímabilsafmörkuð gögn og senda þau í þessi föll.

## 7. Fyrsta implementation-röð – tillaga

Þetta er **útfærslutillaga**, ekki eldri staðfest krafa:

1. Festa presentation contracts og selected-period lag.
2. Byggja `loadInsightSummary(companyId, period)` sem sækir aðeins það sem fyrsta sýn þarf.
3. Byggja deterministic mánaðarserie fyrir bókaðar tekjur/kostnað/niðurstöðu.
4. Bæta `PaymentCardTransaction` í summary-lagið og sýna afstemmingarstöðu.
5. Byggja fyrstu Blönduðu sýnina.
6. Tengja drill-down í núverandi bankarannsókn og fylgiskjöl.
7. Færa eldri sérreglur úr `page.tsx` yfir í sérhæfð domain-lög í áföngum.
8. Aðeins síðan taka stærri refactor á núverandi 3.700 línu síðunni.

## 8. Afmörkun – hvað má fyrsta Innsýn ekki fullyrða

Fylgiskjöl ein og sér sanna ekki:

- fulla lausafjárstöðu,
- allt sjóðstreymi,
- að öll sala eða útgjöld séu komin inn,
- framtíðaráhrif án staðfestra skuldbindinga.

Framsetning þarf að segja skýrt hvort niðurstaða sé byggð á bókun, banka, korti, þekktum events eða ófullkomnum gögnum.

## 9. Gæðapróf fyrir nýja sýn

Áður en ný Innsýn tekur við skal hægt að svara já við:

- Skil ég á nokkrum sekúndum hvað er að gerast?
- Sé ég hvað hefur breyst?
- Sé ég hvað skiptir mestu máli?
- Get ég opnað skýringuna?
- Get ég farið niður í sönnunargögn?
- Er augljóst hvað er bókað, þekkt og óstaðfest?
- Er sama tala eins í Blönduð/Myndræn/Tölur/Skýring?
- Getur kerfið sagt „við vitum þetta ekki enn“ í stað þess að giska?

Kjarnaprófið stendur áfram:

> Grípur þetta mig? Skil ég reksturinn á nokkrum sekúndum?

## 10. Tímabilsafmarkað loader-lag – 27.09.2026

Næsta lag eftir presentation-grunninn er `loadInsightSummary(companyId, period)`.

Loaderinn er viljandi takmarkaður við valið tímabil og jafnlanga samanburðartímabilið. Hann á ekki að endurtaka eldri hegðun þar sem öll saga fylgiskjala/bankafærslna er lesin við hverja opnun.

Fyrsta útgáfa sameinar:

- bókaðar færslur,
- bankafærslur,
- greiðslukortafærslur.

### Bókuð gögn – mikilvæg upprunaregla

Eitt `Receipt` getur verið stórt frumskjal/PDF sem inniheldur fleiri en eitt greint og bókað `AiDetectedDocument`. Þess vegna er ekki öruggt að nota `Receipt.entries` sem eina dagsetta/mótaðilatengda einingu fyrir nýja Innsýn.

Nýja summary-lagið les því:

- bókuð AI-skjöl úr `AiDetectedDocument.bookingEntries` þegar `voucherNumber` og `approvedAt` eru til,
- handvirk fylgiskjöl úr `Receipt.entries` aðeins þegar `Receipt.voucherNumber` er til.

Þetta varðveitir rétta dagsetningu og mótaðila fyrir hvert bókað skjal og kemur í veg fyrir tvítalningu.

### Banki og kort

Bankasamantekt varðveitir brúttó innstreymi, brúttó útstreymi og nettóflæði sem aðskildar stærðir. Kortaafstemming notar absolute fjárhæð fyrir coverage svo endurgreiðsla felli ekki út kaup í heildarafstemmingu; kaup og inneignir eru jafnframt sundurliðuð.

## 11. Fyrsta raunverulega Blönduða sýnin – 27.09.2026

Fyrsta UI-sýnin yfir nýja summary-lagið er nú byggð sem aðskilin prófunarleið undir:

`/innsyn/ny`

Markmiðið er að sannreyna tölur, sjónræna röð og stjórnendaupplifun áður en nýja sýnin tekur yfir `/innsyn`.

Sýnin notar aðeins `loadInsightSummary(...)` og þarf því ekki að lesa gamla stóra Innsýn-gagnasafnið eða keyra eldri ársgreininguna til að teikna fyrsta skjá.

V1 sýnir:

- deterministic stjórnendafrásögn úr bókuðum tölum og afstemmingarstöðu,
- tekjur, rekstrargjöld og niðurstöðu með samanburði þegar sambærileg gögn eru til,
- eitt sameiginlegt þróunargraf eftir mánuðum,
- stærstu bókuðu gjaldalykla,
- stærstu mótaðila eftir bókuðum rekstrarkostnaði,
- sérmerkt bankagögn og kortagögn,
- gagnacoverage fyrir valið tímabil,
- truth-state skýringu: Bókað / Þekkt / Bíður staðfestingar.

### Mikilvæg leiðrétting í loader

Manual `Receipt` er aðeins tekið inn þegar það hefur **engin** `AiDetectedDocument` tengd við sig. Þetta fylgir sömu canonical reglu og bókaða skjalasafnið og kemur í veg fyrir að bókun úr greindu skjali og móður-Receipt verði talin tvisvar.

`coverage` telur nú aðeins gögn **innan valda aðaltímabilsins**, ekki samanlagt aðaltímabil + samanburðartímabil.

### Tímabil

Tímabilshelperinn var hertur áður en UI var tengt:

- `Þessi mánuður`, `Þessi ársfjórðungur` og `Þetta ár` eru nú **til dagsins í dag**, ekki út í framtíðina,
- samanburður þeirra er almanakslega sambærilegur við fyrra tímabil,
- `Síðustu 12 mánuðir` bera saman við sömu rúllandi 12 mánaða glugga ári fyrr,
- sérvalið tímabil heldur jafnlöngum fyrri samanburði.

Þetta kemur í veg fyrir að núverandi mánuður/ár líti út fyrir að hafa hrunið bara vegna framtíðardaga án gagna.

### Af hverju sérstök leið fyrst?

Gamla `/innsyn` er víðtæk djúpgreining sem enn inniheldur verðmæta vinnu. Hún er ekki rifin niður í fyrsta UI-áfanga. `/innsyn/ny` leyfir beina A/B-sannprófun á nýju stjórnendasýninni án þess að raska núverandi rannsóknarflæði.
