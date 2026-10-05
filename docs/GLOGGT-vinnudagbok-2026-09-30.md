# GLÖGGT – vinnudagbók 30. september 2026

**Dagsetning:** miðvikudagur 30. september 2026  
**Tímabil skýrslu:** frá um kl. 07:00 til um kl. 21:10  
**Meginþemu dagsins:** live staðfesting banki↔FinancialEvent, sameining bókunar- og FinancialEvent-samhengis, temporal plausibility, stöðvun á sérsmíði og arkitektúrspivot yfir í canonical FinancialFacts, stýrt samstarf ChatGPT + Codex/Astra Light, diagnostic-core fyrir bankaafstemmingu, read-only loader og Prisma `REPEATABLE READ` / `READ ONLY` adapter, fyrsta raunverulega 331-færslu diagnostic snapshotið, áframhaldandi bókun hjá Benedikt og uppgötvun á almennri duplicate-villu fyrir endurtekin lánaskjöl.

---

## 1. Yfirlit dagsins

30. september varð bæði **framkvæmdadagur og leiðréttingardagur í arkitektúr GLÖGGT**.

Dagurinn hófst á stöðunni frá 29. september, þar sem nýi `BANK_TO_FINANCIAL_EVENT` staðfestingarkjarninn var kominn í production en enn vantaði raunverulegt heimildastyrkt server-action flæði og UI. Fyrri loka-checkpoint var:

- `b42dd7c` – **Bæta við staðfestingu á bankagreiðslu móti FinancialEvent**
- Vercel Production: Ready
- deterministic candidate- og confirmation-kjarni til staðar
- raunstaðfesting #275 ↔ #2 enn óframkvæmd við upphaf dags

Fyrri hluti dagsins fór í að tengja þennan kjarna við raunverulegt GLÖGGT-flæði, keyra live staðfestingar og bæta UI þannig að notandinn sæi skýrt hvað væri staðfest, hvað væri aðeins tillaga og hvað væri enn óbókað.

Um miðjan dag kom síðan mikilvægari arkitektúrspurning upp: við vorum farin að skoða einstök skjöl og einstök temporal tilvik mjög náið, og Benedikt benti réttilega á hættuna á að **sérsmíða reconciliation-vélina út frá núverandi gögnum**. Þar var tekin meðvituð stefnubreyting:

> Reconciliation-kjarninn á ekki að þekkja Skattinn, HS Veitur, íslensk mánaðarheiti eða ákveðin PDF-form. Hann á að vinna með canonical fjármálastaðreyndir.

Þetta leiddi til stærstu byggingarvinnu dagsins:

1. read-only arkitektúrúttekt á reconciliation-laginu;
2. skilgreining á sameinuðu diagnostic contracti;
3. smíði `bank-diagnostics-v3`;
4. read-only diagnostic loader;
5. Prisma adapter með einni `REPEATABLE READ` transaction og PostgreSQL `SET TRANSACTION READ ONLY`;
6. fyrsta raunverulega snapshot af öllum 331 bankafærslum fyrirtækis #8 / bankareiknings #2.

Snapshotið gaf loksins staðreyndir í stað ágiskana:

- 331 bankafærslur;
- 8 `CONFIRMED`;
- 19 `SINGLE_TARGET_CANDIDATE`;
- 3 `DATA_CONFLICT`;
- 301 `UNRESOLVED`;
- 304 með ekkert candidate í booking eða FinancialEvent;
- 7 `BOOKING_ONLY`;
- 19 `EVENT_ONLY`;
- 1 `BOTH`.

Þetta staðfesti að gamla `1 / 7 / 323` mælaborðið var aðeins booking-sýn og því villandi sem heildarmæling, en einnig að raunverulegt coverage er enn allt of lágt.

Seinni hluti kvöldsins færðist aftur yfir í raunverulega bókun hjá Benedikt. Þar fundum við nýtt almennt gagnalíkansvandamál: endurtekin lánaskjöl frá Festa/Landsbankanum bera sama `Innheimtubréf númer: 338379`, en númerið er í raun **lánatenging / obligation identity**, ekki einstakt reikningsnúmer. Núverandi duplicate-vörn túlkar það ranglega sem unique receipt number og stöðvar lögmæta bókun næstu mánaðarafborgunar.

Dagurinn endaði viljandi áður en þessi duplicate-vörn var breytt. Codex/Astra Light náði að staðfesta read-only að bókunarstaðfestingin ber nú aðeins saman `receiptNumber` innan fyrirtækis, en notkunartakmörk Codex náðust áður en full úttekt kláraðist. Enginn workaround var gerður og engin duplicate-vörn var veik.

---

# 2. Staða við upphaf dags um kl. 07:00

Upphafspunkturinn var production-checkpointið frá 29. september:

`b42dd7c` – **Bæta við staðfestingu á bankagreiðslu móti FinancialEvent**

Til staðar voru:

- `FinancialEventPayment`;
- canonical `FinancialReconciliation`;
- participant-lag;
- audit;
- over-allocation vörn;
- idempotency;
- deterministic endurmat candidate við staðfestingu;
- `SERIALIZABLE` write-flow;
- vörn gegn endurnotkun bankafærslu sem þegar hafði reconciliation;
- banki↔FinancialEvent candidate-lag.

Það sem vantaði var fyrst og fremst:

- server action sem notaði raunverulegan innskráðan notanda;
- aðgangsvörn með `canReconcileBookkeeping`;
- UI candidate-birting;
- synilegt pending/success feedback;
- stýrð live production staðfesting.

Þekkt untracked atriði í repo voru áfram:

- óvenjulega scratch-skráin `"cratchreviewed-document-type-scan.ts\357\200\242"`;
- `docs/GLOGGT-vinnudagbok-2026-09-29.md`.

Reglan stóð áfram:

> Ekki `git add .`. Stage-a aðeins nákvæmlega þær skrár sem tilheyra viðkomandi breytingu.

---

# 3. Heimildastyrkt server action fyrir FinancialEvent staðfestingu

Fyrsta stóra verkefnið var að tengja confirmation-kjarnann við raunverulegt authorization-lag GLÖGGT.

Í `app/banki/actions.ts` var bætt við server action sem:

1. les `companyId`, `bankTransactionId` og `eventId`;
2. notar `bankContext(companyId)` til að fá raunverulegt `{ companyId, userId }`;
3. kallar `getCompanyAccess(companyId)`;
4. krefst `allowed && canReconcileBookkeeping`;
5. kallar `confirmBankFinancialEventPayment(...)`;
6. revalidate-ar viðeigandi bankasíðu.

Í fyrstu skilaði actionið result-objecti og lenti í React/form action TypeScript ósamræmi. Það var leiðrétt með því að actionið skilaði `void`.

Commit:

`8c1efcf` – **Tengja heimildastyrkta FinancialEvent staðfestingu**

Commitið var push-að á `main` og Vercel Production varð Ready.

Mikilvæg niðurstaða:

> Confirmation fer nú í gegnum raunverulegt session/user/company permission lag og AuditEvent fær raunverulegan innskráðan notanda, ekki handvalið ID úr scratch-scripti.

---

# 4. FinancialEvent tillögur tengdar við bankaafstemmingar-UI

Næst voru FinancialEvent candidates sýndir á `/banki/[id]/afstemming`.

UI-reglur:

- candidate er tillaga, ekki staðfesting;
- notandi þarf að velja explicit;
- núverandi booking candidate-sýn er varðveitt;
- textar bættir við í i18n-lag fyrir íslensku, ensku, pólsku og serbnesku;
- ekkert auto-confirm.

Commit:

`831703e` – **Baeta FinancialEvent tillogum vid bankaafstemmingu**

Vercel Production varð Ready.

---

# 5. Fyrsta live staðfestingin – Bank #275 ↔ FinancialEvent #2

Fyrsta stýrða production-prófið var:

### BankTransaction #275

- companyId: 8
- amount: `-36.027`
- date: 09.02.2026
- texti: Ríkissjóðsinnheimtur
- staða fyrir staðfestingu: `UNRECONCILED`

### FinancialEvent #2

- `CHARGE`
- amount: `+36.027`
- eventDate: 29.01.2026
- externalReference: `BM102941605`
- status: `OPEN`

UI-ið gaf fyrst lítið sýnilegt feedback eftir smell, þannig að staðfest var read-only úr DB hvað hafði gerst.

Niðurstaða:

- `BankTransaction #275.status = RECONCILED`;
- `FinancialEvent #2.status = OPEN` – viljandi óbreytt;
- `FinancialEventPayment #7`:
  - `CONFIRMED`;
  - 36.027 ISK;
  - source `USER`;
  - matchType `EXACT_EVENT_AMOUNT_EXTENDED_DATE`;
- `FinancialReconciliation #1`:
  - `CONFIRMED`;
  - source `MANUAL`;
  - réttur `confirmedByUserId = 13`;
- participants:
  - BANK_TRANSACTION #275 / MONEY_MOVEMENT;
  - FINANCIAL_EVENT #2 / OBLIGATION;
- engin allocation var stofnuð.

AuditEvent #1215 staðfesti einnig fullan rekjanleika:

- companyId 8;
- userId 13;
- entity `FinancialEventPayment #7`;
- action `CONFIRM_BANK_TO_FINANCIAL_EVENT`;
- before/after sýndi breytinguna;
- metadata varðveitti event/bank/payment/reconciliation IDs, amount, 11 daga bil og reason.

Þetta var fyrsta sönnunin að allt authorization + payment + reconciliation + audit flæðið virkaði saman í production.

---

# 6. Sýnilegt pending/success feedback eftir staðfestingu

Vegna þess að fyrsta live-prófið leit út eins og hnappurinn hefði „ekkert gert“ var UI feedback bætt við.

Nýtt form/component sýndi:

- pending stöðu;
- aðgerð ekki endurtekin á meðan keyrsla stendur;
- grænt **„Tenging staðfest“** eftir staðfestingu;
- þegar færsla er þegar staðfest birtist ekki aftur sama staðfestingarhnappur;
- dagsetningar og krónur formateraðar deterministic.

Commit:

`99a8ecf` – **Synileg stadfesting FinancialEvent afstemmingar**

Vercel Production varð Ready.

Production-skjár fyrir #275/#2 var síðan staðfestur réttur.

---

# 7. CREDIT-flæðið staðfest með sama almenna kjarna

Næsta live-próf var CREDIT:

- banki: Ríkissjóður Íslands `+11.427`;
- FinancialEvent #3: `CREDIT -11.427`;
- eventDate 30.01.2026;
- externalReference `BM-CN-1078697882`.

Sama generic server action og confirmation-kjarni virkaði.

Niðurstaðan sýndi að GLÖGGT þurfti ekki sérreglu fyrir endurgreiðslur:

- CHARGE útgreiðsla;
- CREDIT innstreymi;

fóru í gegnum sama canonical reconciliation-lag með gagnstæðu formerki.

---

# 8. Cross-layer sameining – HS Veitur #277 ↔ Event #46

Næsta dæmi sýndi að booking-lagið og FinancialEvent-lagið gátu bæði fundið sama fjárhagslega samhengi.

BankTransaction #277:

- HS Veitur;
- `-62.817`;
- 09.02.2026.

Booking candidate:

- ReceiptEntry #591;
- Receipt #104;
- account 1510;
- texti um skuld vegna orkureiknings;
- `-62.817`.

FinancialEvent #46:

- `CHARGE +62.817`;
- 31.01.2026;
- externalReference `TR004668934`;
- PRIMARY document link á sama Receipt #104.

Ef bæði væru birt sem tvær óskyldar aðgerðir myndi UI líta út eins og tvær ólíkar skuldbindingar væru til.

Því var smíðað `cross-layer.ts` sem sameinar evidence til birtingar þegar booking candidate og FinancialEvent eiga sama bank context og explicit PRIMARY receipt-samhengi.

UI varð:

**„Möguleg greiðsla skuldbindingar“**

með:

- FinancialEvent evidence;
- booking evidence;
- einum staðfestingarhnappi.

Commit:

`aa667f9` – **Sameina FinancialEvent og bokun i bankaafstemmingu**

Próf eftir breytingu: 33/33 relevant reconciliation-próf.

Production HS #46 var síðan staðfest með góðum árangri og engin duplicate aðgerð birtist.

---

# 9. Document-context – greiðsla má vera staðfest þó frumskjal sé enn óbókað

Næsta mikilvæga testcase var Ríkissjóðsinnheimtur:

- BankTransaction #226: `-1.675`, 16.03.2026;
- FinancialEvent #20: `CHARGE +1.675`, 03.03.2026;
- externalReference `BM103862271`;
- PRIMARY Receipt #172;
- booking candidate state: NONE.

Skjalið var yfirfarið, en ekki bókað:

- document REVIEWED;
- `approvedAt = null`;
- ReceiptEntries ekki til;
- document booking proposal til:
  - 4740 debet 1.675;
  - 1510 kredit 1.675.

Þetta sýndi mikilvæga tvívídd:

> Greiðslustaða og bókunarstaða frumskjals eru ekki sami sannleikur.

Nýtt `document-context.ts` gerði UI kleift að sýna:

- greiðslan má hafa deterministic FinancialEvent candidate;
- skjalið er **„Yfirfarið, ekki bókað“**;
- staðfesting greiðslu bókar ekki fylgiskjalið.

Eftir staðfestingu sýndi UI:

- græna staðfestingu greiðslu;
- gula stöðu **„Bókun fylgiskjals bíður“**.

Commit:

`7edf66c` – **Syna bokunarstodu tengds fylgiskjals i afstemmingu**

Prófasafnið varð 37/37.

Sama almenna pattern var síðan staðfest á:

- HS Veitur Event #47, 56.083 kr.;
- CREDIT Event #43, 9.257 kr.

---

# 10. Tvíræð 49.939 kr. færsla og temporal plausibility

BankTransaction #7:

- Ríkissjóðsinnheimtur;
- `-49.939`;
- 17.08.2026;
- reference `037952`.

Upphaflega komu tvö FinancialEvent candidates:

### Event #44

- CHARGE 49.939;
- eventDate 28.08.2026;
- externalReference `BM110198517`;
- skjal dagsett 28.08.2026.

### Event #42

- CHARGE 49.939;
- eventDate 29.07.2026;
- externalReference `BM109598625`;
- skjal dagsett 29.07.2026.

Benedikt sýndi frumskjölin.

Þar kom fram:

**BM110198517**
- dagsetning 28.08.2026;
- gjalddagi 01.09.2026;
- eindagi 15.09.2026;
- ágúst 2026.

**BM109598625**
- dagsetning 29.07.2026;
- gjalddagi 01.08.2026;
- eindagi 17.08.2026;
- júlí 2026.

Bankagreiðslan var því nákvæmlega á eindaga júlískjalsins, en ágústskjalið var ekki einu sinni til á bankadeginum.

Þetta leiddi til temporal plausibility-vörnar:

- future reviewed source document útilokar CHARGE candidate;
- exact reference getur haldið documented prepayment mögulegri;
- vörnin er CHARGE-specific;
- mixed source dates fail closed;
- due date/final due date verða deterministic evidence;
- materialization varðveitir period/payment terms fyrir framtíðarskjöl.

Próf eftir breytingu: 55/55.

Commit:

`0cc82e7` – **Baeta timalegri plausibility i FinancialEvent afstemmingu**

Production staðfesti að Event #44 hvarf úr candidate-sýn og Event #42 stóð eftir. #42 var síðan staðfest og tengt, en bókun fylgiskjalsins var áfram ólokið.

---

# 11. Stefnubreyting: stöðva sérsmíði áður en hún festist í kjarna

Eftir temporal-vinnuna kom mikilvæg athugasemd frá Benedikt:

> Erum við farin að sérsmíða of mikið út frá þeim reikningum sem við höfum núna? Næsti viðskiptavinur getur verið með allt önnur gögn og við höfum ekki aðgang að þeim fyrirfram.

Þessi spurning breytti vinnunni um miðjan dag.

Við tókum þá þá arkitektúrreglu að reconciliation-vélin eigi að vera blind á upprunaskjalið:

```text
PDF / XML / OCR / template / AI
        ↓
canonical FinancialFacts / DocumentFacts
        ↓
FinancialEvent / booking facts
        ↓
reconciliation
```

Reconciliation-kjarninn á ekki að þekkja:

- Skattinn;
- HS Veitur;
- Nova;
- Festa;
- íslensk mánaðarheiti;
- „Gjalddagi“ eða „Eindagi“ sem raw orð;
- ákveðinn PDF-layout;
- ákveðinn bókhaldslykil sem vendor-reglu.

Hann á að vinna með facts eins og:

- canonical counterparty;
- document type;
- document number/reference;
- document date;
- due date;
- final due date;
- period start/end;
- amount;
- currency;
- direction;
- provenance;
- confidence/evidence.

Þetta varð eitt mikilvægasta arkitektúrskref dagsins.

---

# 12. Hvernig þroskuð kerfi forðast AI á hverju skjali

Rætt var sérstaklega hvernig kerfi á borð við DK geta unnið án þess að AI þurfi að lesa hvert skjal.

Meginhugsunin fyrir GLÖGGT varð:

1. **Structured gögn fyrst**
   - XML;
   - rafrænir reikningar;
   - API;
   - bankatengingar.

2. **Þekkt deterministic template**
   - fingerprint/layout;
   - parser;
   - enginn AI-kostnaður.

3. **Óþekkt skjal**
   - AI eða maður hjálpar að túlka í fyrsta sinn;
   - niðurstaðan verður canonical facts.

4. **Næstu sambærilegu skjöl**
   - deterministic template/regla;
   - AI ekki kallað aftur nema sniðið breytist eða óvissa kemur upp.

Aðstoðargræjan á þannig að vera fallback og kennari á óþekkt snið, ekki daglegur reikningslesari.

---

# 13. Maðurinn sem exception-handler

Benedikt benti einnig á að síðustu örfáu reikningana gæti maðurinn sjálfur fundið.

Þetta varð samþykkt hönnunarregla:

- meirihluti er sjálfvirkt leystur eða fær eina skýra tillögu;
- tvíræð tilfelli fara í „Þarf yfirferð“;
- ef ekkert finnst fær maðurinn **„Finna fylgiskjal sjálfur“**;
- mannleg staðfesting á síðan að verða gagnleg þekking/template fyrir framtíðina.

Markmiðið er ekki 100% sjálfvirkni á öllum mögulegum skjölum, heldur að handvirki exception-hópurinn verði lítill, skýr og rekjanlegur.

---

# 14. Astra Light / Codex – verkaskipting fest

Í dag var sérstaklega fest að:

**ChatGPT er áfram aðalarkitekt GLÖGGT.**

ChatGPT:

- stýrir arkitektúr;
- ákveður hvaða verk fara út;
- setur öryggismörk;
- yfirfer niðurstöður;
- samþykkir checkpointa;
- ákveður með Benedikt næsta skref.

**Codex/Astra Light** er aðstoðarverkfæri:

- read-only úttektir;
- greiningar;
- synthetic tests;
- afmörkuð kóðunarverk;
- regression leit;
- stórar en vel skilgreindar yfirferðir.

Það tekur ekki yfir:

- stefnu;
- arkitektúr;
- product identity;
- production decisions.

Þetta var orðað sem:

> GLÖGGT vinnur áfram eftir hugsun Benedikts og ChatGPT. Hjálpartæki mega létta aðferðirnar en breyta ekki „sálinni“.

---

# 15. Fyrsta reconciliation architecture audit með Astra Light

Astra fékk read-only verkefni:

- engar breytingar;
- enginn DB-lestur;
- ekkert patch;
- engin migration;
- greina reconciliation-lagið;
- sérstaklega skýra 323 `NONE`.

Stærsta niðurstaðan var mjög mikilvæg:

> **323 `NONE` þýddi aðeins „engin booking candidate“, ekki „engin samsvörun í öllu kerfinu“.**

Gamla summary-UI taldi aðeins banki↔bókun.

FinancialEvent-tillögur og staðfestar greiðslutengingar höfðu verið sérleið og lækkuðu ekki 323 töluna.

Úttektin fann einnig:

- reconciliation confirmation-kjarni hefur góð tenant/audit/idempotency mörk;
- coverage takmarkast mikið af upstream data/materialization;
- íslensk textatúlkun var farin að leka inn í reconciliation;
- CHARGE/CREDIT + ISK + whole-amount flow er enn þröngur;
- source-document temporal parsing átti ekki heima í reconciliation til lengri tíma;
- canonical FinancialFacts/DocumentFacts lag væri eðlilegt næsta arkitektúrmarkmið.

---

# 16. Diagnostic contract – fyrst mæla, síðan breyta

Næsta Astra-verkefni var að hanna diagnostic contract, enn read-only.

Meginreglur sem voru samþykktar:

- `0` = mælt núll;
- `null` = ekki metið;
- candidate ≠ confirmed;
- booking/event/confirmation eru sjálfstæðar víddir;
- hver bankafærsla fær nákvæmlega eina overall diagnostic stöðu;
- reason codes segja hvað gögnin sanna, ekki hvað okkur grunar;
- unsupported bankaflæði má ekki giska út frá frjálsum bankatexta.

Samþykkt overall priority:

1. `DATA_CONFLICT`
2. `CONFIRMED`
3. `SOURCE_ERROR`
4. `CANDIDATES_BLOCKED`
5. `SINGLE_TARGET_CANDIDATE`
6. `MULTIPLE_TARGET_CANDIDATES`
7. `UNSUPPORTED`
8. `UNRESOLVED`

Coverage er sérvídd:

- `NONE`;
- `BOOKING_ONLY`;
- `EVENT_ONLY`;
- `BOTH`;
- `UNKNOWN`.

---

# 17. Diagnostic-core v3

Astra fékk síðan leyfi til að smíða aðeins diagnostic grunnlagið og synthetic tests.

Nýjar skrár:

- `diagnostics-contract.ts`;
- `diagnostics.ts`;
- `diagnostics.test.ts`;
- síðar `domain-rule-result.ts`.

Production candidate logic var refactored í pure rule results án breytingar á behavior.

Fyrsta implementation-prófun:

- 77/77 próf;
- TypeScript hreint;
- `git diff --check` hreint;
- parity gegn `0cc82e7` staðfest.

ChatGPT yfirfór kóðann og fann fjögur atriði sem þurfti að laga:

1. production/domain code má ekki depend-a á diagnostics;
2. invalid bank amount má ekki láta diagnostic snapshot hrynja;
3. Git-history parity test á ekki að vera varanlegt CI dependency;
4. tenant mismatches mega ekki hverfa þegjandi.

Eftir hreinsun:

- 81/81 próf;
- `bank-diagnostics-v2`.

Önnur arkitektúryfirferð fann fjögur nákvæm merkingaratriði:

1. materialization vocabulary átti ekki heima undir reconciliation-domaini;
2. `TENANT_SCOPE_VIOLATION` var stundum notað þegar target var aðeins ósannreynanlegt;
3. `CONFIRMED_LINK` mátti aðeins koma frá `VALID` confirmation;
4. overall priority þurfti að halda `CONFIRMED` ofar diagnostic amount source-error.

Eftir síðustu hreinsun:

- 85/85 próf;
- `bank-diagnostics-v3`;
- matching behavior óbreytt;
- TypeScript hreint;
- `git diff --check` hreint.

Commit:

`8aafc89` – **Baeta diagnostic lagi fyrir bankaafstemmingu**

Tölur:

- 7 files;
- 1.150 insertions;
- 144 deletions.

Push:

`0cc82e7..8aafc89 main -> main`

Vercel Production:

- Ready;
- build um 46 sek.

---

# 18. Read-only diagnostic loader

Næsta lag var loader sem safnar víðara source-inventory án þess að eligibility-filtera það fyrirfram.

Nýjar skrár:

- `diagnostics-source.ts`;
- `diagnostics-service.ts`;
- `diagnostics-source.test.ts`.

Meginreglur:

- loader þekkir aðeins þröngt read-only interface;
- enginn default Prisma client inni í loader;
- booking rows lesnar áður en bank-account/APPROVED filters eru beitt;
- FinancialEvents lesin áður en type/currency/date/amount eligibility filters eru beitt;
- documents/materialization inventory varðveitt;
- malformed/orphan confirmation records varðveitt sem diagnostics;
- explicit tenant mismatch fail closed;
- unresolved target reference er aðgreint frá tenant violation;
- óörugg erlend gögn fara ekki í DTO.

Fyrsta test-lota:

- 111/111 próf.

ChatGPT fann eitt mikilvægt semantic edge-case:

> Ef event inventory read mistekst má ekki kalla fjarveru target `TARGET_REFERENCE_UNRESOLVED`; við vitum aðeins að source var unavailable.

Lagfært:

- source unavailable → `SOURCE_UNAVAILABLE` / `NOT_EVALUATED`;
- source available en target vantar → `TARGET_REFERENCE_UNRESOLVED`.

Eftir lagfæringu:

- 116/116 próf;
- TypeScript hreint;
- `git diff --check` hreint.

Commit:

`ca02fc1` – **Baeta read-only diagnostic loader fyrir bankaafstemmingu**

Vercel Production:

- Ready;
- build um 37 sek.

---

# 19. Prisma adapter – samræmt og raunverulega read-only snapshot

Áður en raunverulegur DB-lestur var leyfður var bætt við sérstöku production adapter-lagi.

Nýjar skrár:

- `diagnostics-prisma.ts`;
- `diagnostics-prisma.test.ts`.

Adapterinn:

1. tekur núverandi sameiginlega Prisma client;
2. opnar **eina** interactive transaction;
3. notar `isolationLevel: "RepeatableRead"`;
4. keyrir:
   `SET TRANSACTION READ ONLY`
   sem fyrsta DB statement innan transaction;
5. þrengir transaction client niður í `DiagnosticReadDb`;
6. lætur allan loaderinn nota sama tx;
7. merkir snapshot `REPEATABLE_READ` aðeins ef transaction lýkur með árangri;
8. fallback-ar aldrei sjálfkrafa yfir í ósamræmdan production-lestur.

Synthetic adapter-próf:

- 125/125 heildarpróf;
- 9 ný adapter-próf;
- enginn raunverulegur DB-lestur við smíði;
- TypeScript hreint;
- `git diff --check` hreint.

Commit:

`745f2d3` – **Baeta read-only Prisma snapshot fyrir bankaafstemmingu**

Vercel Production:

- Ready;
- build um 53 sek.

Þetta varð öryggiskeðjan:

```text
bank-diagnostics-v3
        ↓
read-only diagnostic loader
        ↓
Prisma adapter
        ↓
REPEATABLE READ
        ↓
SET TRANSACTION READ ONLY
```

---

# 20. Fyrsta raunverulega 331-færslu snapshotið

Eftir sérstaka yfirferð á one-shot runner var fyrsta raunverulega DB snapshotið leyft.

Scope:

- `companyId = 8`;
- `bankAccountId = 2`.

Runnerinn mátti aðeins:

- nota shared Prisma client;
- kalla `buildPrismaBankDiagnosticSnapshot`;
- prenta aggregates;
- ekki dump-a bankatexta, references, skjöl eða environment;
- ekki kalla bein Prisma business queries;
- ekki skrifa í DB;
- stoppa ef transaction count væri ekki 331.

Snapshotið tókst.

Metadata:

- schemaVersion: `bank-diagnostics-v3`;
- companyId: 8;
- bankAccountId: 2;
- readConsistency: `REPEATABLE_READ`;
- completeness: `COMPLETE`;
- totalTransactionCount: **331**;
- transactionSucceeded: true;
- readOnlySetupSucceeded: true;
- absolute bank amount total: **22.412.406** í `UNKNOWN` currency bucket;
- excluded transaction count: 0.

Einnig birtist `pg` deprecation warning:

> Calling `client.query()` when the client is already executing a query is deprecated...

Snapshotið var samt COMPLETE og tókst, en uppruni warningarinnar þarf síðar rannsókn áður en snapshots verða regluleg production-aðgerð.

---

# 21. Raunveruleg overall niðurstaða

Exclusive overall states:

| Staða | Fjöldi | Abs. fjárhæð |
|---|---:|---:|
| DATA_CONFLICT | 3 | 173.174 |
| CONFIRMED | 8 | 254.304 |
| SOURCE_ERROR | 0 | 0 |
| CANDIDATES_BLOCKED | 0 | 0 |
| SINGLE_TARGET_CANDIDATE | 19 | 753.473 |
| MULTIPLE_TARGET_CANDIDATES | 0 | 0 |
| UNSUPPORTED | 0 | 0 |
| UNRESOLVED | **301** | **21.231.455** |

Þetta þýðir:

- 8 staðfestar;
- 19 með nákvæmlega eitt target candidate;
- 3 gagnamótsagnir;
- 301 raunverulega óleystar samkvæmt núverandi deterministic lögum.

Um 90,9% bankafærslna eru því enn `UNRESOLVED`.

---

# 22. Coverage – hvað gamla 323 talan var að missa

Sameinað coverage:

- `NONE`: **304**
- `BOOKING_ONLY`: **7**
- `EVENT_ONLY`: **19**
- `BOTH`: **1**
- `UNKNOWN`: 0

Sérstakar tölur:

- `noCandidateInEitherLayer`: 304;
- `noCandidateUnconfirmed`: 301;
- `confirmedTransactions`: 8.

Booking × Event matrix:

- booking NONE + event ZERO = 304;
- booking NONE + event ONE = 19;
- booking POSSIBLE + event ZERO = 6;
- booking POSSIBLE + event ONE = 1;
- booking UNIQUE_STRONG + event ZERO = 1.

Þetta sýndi nákvæmlega:

> Gamla `323 NONE` var booking-only tala.

FinancialEvent-lagið gaf 20 bankafærslum coverage sem gamla summary-spjaldið sá ekki.

En stóri vandinn hvarf ekki: 304 hafa ekkert candidate í hvorugu laginu.

---

# 23. Booking-funnel – af hverju booking coverage er lítið

Booking inventory sýndi:

- 53 ReceiptEntry rows í company scope;
- 13 þeirra á bankalyklinum;
- allar 13 standast status og amount-validity grunnstig;
- signed amount matching gaf 22 bank↔booking pör;
- 22 mismunandi bankafærslur höfðu slíkt amount-par;
- date/party reglan skilaði aðeins 8 candidate-pörum / 8 bankafærslum.

Þetta er mikilvægt:

> Það er ekki hægt að matcha 331 bankafærslur við bókunarlag sem hefur aðeins 13 eligible bank-account booking rows.

Því væri rangt að reyna að „laga“ coverage með því einu að veikja date/party reglur.

---

# 24. FinancialEvent-funnel – 34 event alls

Company inventory:

- 34 FinancialEvents;
- 33 standast studdan type;
- allir 33 eru ISK;
- allir 33 hafa amount;
- allir 33 hafa eventDate;
- allir 33 standast valid input.

Pair funnel:

- 41 amount-compatible bank↔event pör;
- á 31 bankafærslu;
- 36 direction-compatible pör;
- á 30 bankafærslum;
- 21 innan 30 daga;
- á 20 bankafærslum;
- 20 eftir temporal plausibility;
- á 20 bankafærslum.

Þetta staðfesti að FinancialEvent matcherinn er ekki að fleygja hundruðum líklegra eventa.

**Það eru einfaldlega aðeins 34 FinancialEvents í fyrirtækinu.**

---

# 25. Document inventory – líklegur upstream flöskuháls

Snapshotið sá **151 skjöl**.

Materialization:

- `ELIGIBLE`: 33;
- `INELIGIBLE`: 117;
- `SEPARATE_SCHEDULE_FLOW`: 1;
- `NOT_EVALUATED`: 0.

PRIMARY event:

- `HAS_PRIMARY_EVENT`: 34;
- `NO_PRIMARY_EVENT`: 117.

Booking state skjala:

- `REVIEWED_NOT_BOOKED`: **94**;
- `BOOKED`: **17**;
- `NO_BOOKING_PROPOSAL`: 15;
- `UNREVIEWED_NOT_BOOKED`: 25.

Þetta varð stærsta gagnaniðurstaða kvöldsins:

> Reconciliation-kjarninn virðist ekki vera aðal flöskuhálsinn. Stór hluti source-gagnanna hefur einfaldlega ekki komist yfir í canonical booking/FinancialEvent facts sem reconciliation getur unnið með.

Þess vegna kom spurning Benedikts:

> Myndi hjálpa að bóka fyrst?

Svarið var já – það mun líklega bæta coverage verulega, þó það eitt leysi ekki allar 301 óleystu bankafærslurnar.

Bókun gefur:

- fleiri canonical bókhaldsstaðreyndir;
- skýrari document state;
- fleiri deterministic tengingar;
- betri grunn fyrir skuld/greiðslu reconciliation.

Mikilvægt er þó að kostnaður↔skuld bókun er ekki sjálfkrafa bankabókun. FinancialEvent/obligation lag þarf áfram að tengja greiðslu við skuldbindinguna.

---

# 26. Confirmation/data conflict sem þarf síðar rannsókn

Snapshotið sýndi:

- `RECONCILIATION:VALID`: 8;
- `PAYMENT:VALID`: 8;
- `PAYMENT:INCONSISTENT`: 6.

`CONFIRMED_PAYMENT_MISMATCH` tengdist sex confirmation records.

Overall:

- 3 bankafærslur voru `DATA_CONFLICT`.

Allocation facts:

- 365 observed;
- 0 overAllocated;
- 0 notEvaluated.

Þetta var ekki rannsakað til botns í dag.

Mikilvæg næsta read-only rannsókn síðar:

- hvaða 3 bankafærslur eru DATA_CONFLICT;
- hvað nákvæmlega 6 inconsistent payment records tákna;
- hvort þetta sé legacy/payment-vs-reconciliation mismatch eða annað gagnasamhengi.

Ekki á að „laga“ þetta sjálfkrafa.

---

# 27. Áframhaldandi bókun hjá Benedikt

Eftir diagnostic-vinnuna var farið aftur í raunverulega bókun til að bæði vinna bókhaldið áfram og sjá hvernig coverage breytist með fleiri staðfestum gögnum.

## 27.1 Ergo fjármögnun – 34.682 kr.

Skjal sýndi:

- lánveitanda: Ergo fjármögnunarþjónusta;
- dagsetningu/gjalddaga 03.05.2026;
- greiðslu 34.682 kr.;
- afborgun höfuðstóls 31.769 kr.;
- vexti 2.783 kr.;
- gjald 130 kr.;
- númer 104907.

GLÖGGT stöðvaði og bað um lánsnúmer + skuldareikning í stað þess að giska.

Benedikt staðfesti að ætlaður skuldareikningur væri:

- `2220`.

Ákveðið var að nota `104907` sem lánatengingu í þessu samhengi og halda lánauðkenni aðskildu frá korta-/bankareikningsgiskun.

Ekki er í þessari dagbók staðfest að endanleg bókun hafi verið framkvæmd áður en farið var í næsta skjal.

---

## 27.2 Tryggingastofnun – greiðslustaðfesting 58.428 kr.

Næsta skjal var ekki ný krafa/reikningur heldur greiðslustaðfesting frá Tryggingastofnun:

- samtals 58.428 kr.;
- sundurliðun 55.137 kr. + 3.291 kr.;
- vísar til krafna sem hafa sjálfstætt fjárhagslegt samhengi.

Rétt classification:

> **Stuðningsskjal / payment evidence**, ekki ný sjálfstæð bókunarskuldbinding.

Þetta styður aftur FinancialFacts-hugsunina:

- skjal getur sannað greiðslu;
- það þarf ekki sjálft að mynda nýja skuld eða kostnað.

---

# 28. Festa / Landsbankinn – bókun sem stöðvaðist á false-positive duplicate-vörn

Skjal Festa – lífeyrissjóður sýndi meðal annars:

- `Innheimtubréf númer: 338379`;
- tilvísun `109815`;
- gjaldagi 17 af 480;
- gjalddagi 01.02.2026;
- til greiðslu 244.980 kr.

GLÖGGT hafði staðfesta lánatengingu:

- **Lán: `0142-338379`**
- skuldareikningur í þessu skjali: `2200 – Langtímalán`.

Bókunartillagan var:

- D 2200 – afborgun höfuðstóls: 63.299 kr.;
- D 5100 – vextir af skuldum: 171.545 kr.;
- D 5120 – verðbætur: 9.662 kr.;
- D 4980 – tilkynningar-/greiðslugjald: 474 kr.;
- K 1510 – afborgunarkrafa/banki: 244.980 kr.

Debet og kredit stemmdu nákvæmlega.

Við smell á **„Bóka fylgiskjal“** kom React production error #441 í UI.

Vercel-logg sýndi hins vegar raunverulega orsök:

> **Möguleg tvíbókun: reiknings-/kvittunarnúmer 338379 hefur þegar verið bókað sem fylgiskjal 1.**

Því hafði bókunin ekki klárast.

Rétt ákvörðun var:

- ekki smella aftur;
- ekki breyta númerinu handvirkt;
- ekki slökkva á duplicate-vörninni;
- finna fyrst hvað `338379` þýðir.

---

# 29. Samanburður tveggja Festa-skuldabréfa – duplicate-villan sönnuð

Benedikt sýndi tvö skuldabréf fyrir sama lán.

### Fyrra skjal

- `Innheimtubréf númer: 338379`;
- `Tilvísun: 109815`;
- gjaldagi **16 af 480**;
- gjalddagi **01.01.2026**;
- til greiðslu **242.189 kr.**

### Seinna skjal

- `Innheimtubréf númer: 338379`;
- `Tilvísun: 109815`;
- gjaldagi **17 af 480**;
- gjalddagi **01.02.2026**;
- til greiðslu **244.980 kr.**

Þetta sannar:

- `338379` er stöðugt yfir fleiri en eitt mánaðarskjal;
- `109815` er einnig stöðugt;
- skjölin eru samt augljóslega tvær mismunandi afborganir.

Benedikt skýrði nákvæmlega merkinguna:

> `Innheimtubréf númer: 338379` = **Lánatenging**  
> `Lán: 0142-338379`

Þar með er canonical merkingin:

```text
obligation / loan identity = 0142-338379
```

en **ekki**:

```text
unique receipt/invoice number = 338379
```

---

# 30. Almenn arkitektúrregla úr duplicate-villunni

Þessi uppgötvun er ekki Festa-sérregla.

GLÖGGT þarf almennt að aðskilja:

### Obligation identity

Stöðugt yfir marga gjalddaga:

- loan id;
- contract id;
- collection letter id;
- subscription id;
- lease id;
- annað stöðugt skuldbindingarauðkenni.

### Document/payment instance identity

Einstök afborgun/skjal:

- obligation id;
- installment number;
- due date;
- document date;
- amount;
- eða önnur canonical instance fact-samsetning eftir skjalagerð.

Fyrir Festa-dæmið:

```text
loanId: 0142-338379
installment: 17 / 480
dueDate: 2026-02-01
amount: 244980
```

Janúarskjalið:

```text
loanId: 0142-338379
installment: 16 / 480
dueDate: 2026-01-01
amount: 242189
```

Sama lán – mismunandi document/payment instance.

Meginregla:

> **Stöðugt skuldbindingarauðkenni má ekki eitt og sér vera unique document identifier.**

---

# 31. Read-only duplicate-rannsókn hafin en stöðvuð vegna Codex limit

ChatGPT mótaði read-only Codex/Astra rannsókn:

- finna exact error source;
- rekja uppruna `receiptNumber`;
- finna current duplicate key;
- skoða hvernig loan binding er geymd;
- skrá hvaða instance facts eru tiltæk;
- leggja til minnstu almennu lagfæringu;
- enginn kóði, enginn DB-lestur, engin schema-breyting.

Codex náði að lesa nóg til að staðfesta bráðabirgðaniðurstöðu:

> Villan kemur úr bókunarstaðfestingu sem ber saman aðeins `receiptNumber` innan fyrirtækis, óháð gjalddaga, upphæð eða lánstengingu.

Það fann einnig vísbendingu um að innlestrarvörnin geti merkt sama númer sem tvírit án instance-aðgreiningar, þannig að endanleg lagfæring þarf líklega að taka mið af **báðum duplicate-vörnum**.

Þá náðist Codex/Astra Light notkunartakmark.

Engin breyting var gerð.

Þetta varð viljandi stopp-punktur dagsins.

---

# 32. Production commits / checkpoints dagsins

Mikilvægustu production-checkpoints 30. september:

| Commit | Lýsing |
|---|---|
| `8c1efcf` | Tengja heimildastyrkta FinancialEvent staðfestingu |
| `831703e` | Bæta FinancialEvent tillögum við bankaafstemmingu |
| `99a8ecf` | Sýnileg staðfesting FinancialEvent afstemmingar |
| `aa667f9` | Sameina FinancialEvent og bókun í bankaafstemmingu |
| `7edf66c` | Sýna bókunarstöðu tengds fylgiskjals í afstemmingu |
| `0cc82e7` | Bæta tímalegri plausibility í FinancialEvent afstemmingu |
| `8aafc89` | Bæta diagnostic lagi fyrir bankaafstemmingu |
| `ca02fc1` | Bæta read-only diagnostic loader fyrir bankaafstemmingu |
| `745f2d3` | Bæta read-only Prisma snapshot fyrir bankaafstemmingu |

Öll þessi checkpoint sem voru skoðuð í Vercel urðu **Ready / Production**.

Síðustu þrjú mynda nýja diagnostic öryggiskeðjuna:

```text
8aafc89  diagnostic-core v3
    ↓
ca02fc1  read-only diagnostic loader
    ↓
745f2d3  REPEATABLE READ + READ ONLY Prisma snapshot
```

---

# 33. Prófunarþróun yfir daginn

Relevant reconciliation/diagnostic prófasafn stækkaði í skrefum:

- 33/33 eftir cross-layer;
- 37/37 eftir document context;
- 55/55 eftir temporal plausibility;
- 77/77 fyrsta diagnostic implementation;
- 81/81 eftir dependency/invalid amount/tenant hreinsun;
- 85/85 eftir síðustu diagnostic-v3 merkingarhreinsun;
- 111/111 eftir read-only loader;
- 116/116 eftir source unavailable vs unresolved target lagfæringu;
- 125/125 eftir Prisma adapter.

Auk þess:

- `npx tsc --noEmit` var hreint á checkpointum;
- `git diff --check` var hreint;
- matching behavior var varðveitt með regression/parity prófum;
- engin matching threshold var breytt í diagnostic-vinnunni.

---

# 34. Reglur sem voru sérstaklega varðveittar í dag

## Reconciliation

- candidate ≠ confirmed;
- `POSSIBLE` má aldrei auto-confirm-a;
- confirmation endurmetur deterministic rules;
- payment state og FinancialEvent lifecycle eru aðskilin;
- payment confirmation bókar ekki frumskjal;
- ambiguity þarf mannlegt val;
- tenant mismatch fail closed;
- source unavailable ≠ unresolved reference;
- invalid amount má ekki hrynja diagnostic snapshoti;
- snapshot diagnostics mega ekki breyta matching behavior.

## Arkitektúr

- raw document parsing á ekki heima í reconciliation-kjarna;
- vendor/layout/language adapterar mega framleiða canonical facts;
- canonical facts eiga að vera almenni samningurinn;
- AI er fallback fyrir óleysta túlkun;
- templates/structured data/deterministic reglur eiga að leysa endurtekin snið;
- maðurinn er exception-handler, ekki sjálfvirkur staðgengill.

## Þróunarstjórn

- ChatGPT er aðalarkitekt;
- Codex/Astra Light fær afmörkuð verk;
- hvert stærra Astra-verk kemur aftur til arkitektúryfirferðar;
- ekkert sjálfstætt production rewrite;
- explicit `Allow once`, ekki varanleg terminal-heimild;
- fyrstu raun-DB aðgerðir fóru aðeins í gegnum samþykktan READ ONLY adapter.

---

# 35. Atriði sem eru opin eftir daginn

## A. Duplicate-vörn fyrir obligation vs document instance

**Brýnasta næsta verkefni.**

Þarf að klára read-only úttekt á:

- bókunarstaðfestingar duplicate guard;
- innlestrar duplicate guard;
- hvernig `receiptNumber` er fyllt;
- hvernig `LoanBinding` / loan identity kemur inn;
- hvaða instance facts eru tiltæk þegar bókun er staðfest.

Markmið:

- sama unique invoice instance → duplicate;
- sama lán/obligation + annar gjalddagi/installment → ekki duplicate;
- venjuleg reikningsduplicate-vörn má ekki veikjast.

Festa-skjal gjaldaga 17/480 er **enn óbókað** vegna þessarar varnar.

## B. 3 DATA_CONFLICT / 6 inconsistent payment records

Read-only rannsókn síðar.

Ekki laga sjálfkrafa.

## C. PostgreSQL `client.query()` deprecation warning

Snapshot tókst en warning þarf upprunagreiningu áður en diagnostic snapshot verður regluleg runtime-aðgerð.

## D. Coverage

Baseline eftir snapshot:

- 331 total;
- 8 confirmed;
- 19 single-target candidates;
- 3 data conflict;
- 301 unresolved.

Þessi baseline á að varðveita og keyra aftur eftir að fleiri skjöl hafa verið bókuð/materialized.

## E. FinancialFacts / DocumentFacts

Stóra næsta arkitektúrverk eftir brýna duplicate-fix:

- canonical facts lag milli extraction og reconciliation;
- sérstaklega aðskilja obligation identity frá document instance identity;
- raw tungumál/layout parsing færist út úr reconciliation.

---

# 36. Nákvæmur stoppunktur dagsins

**HEAD / production checkpoint:**  
`745f2d3` – **Baeta read-only Prisma snapshot fyrir bankaafstemmingu**  
Vercel Production: Ready.

Diagnostic baseline:

- companyId 8;
- bankAccountId 2;
- 331 bankafærslur;
- `REPEATABLE_READ`;
- `COMPLETE`;
- 8 confirmed;
- 19 single-target candidates;
- 3 data conflicts;
- 301 unresolved.

Bókunarstaða síðasta virka skjals:

**Festa – lífeyrissjóður**
- loan: `0142-338379`;
- installment: 17 / 480;
- due date: 01.02.2026;
- amount: 244.980 kr.;
- proposed booking balanced;
- **ekki bókað**;
- blocked af false-positive duplicate-vörn vegna `receiptNumber = 338379`.

Samanburðarskjal staðfestir:

- sama `338379`;
- sama `109815`;
- installment 16 / 480;
- due date 01.01.2026;
- amount 242.189 kr.

Canonical niðurstaða:

> `338379` er loan/obligation identity sem verður `0142-338379`, ekki unique document number.

Codex/Astra Light rannsókn:

- read-only;
- náði að staðfesta að booking duplicate guard ber nú saman `receiptNumber` innan fyrirtækis;
- full úttekt ekki kláruð vegna usage limit;
- engar skrár breyttar í þessari duplicate rannsókn.

---

# 37. Fyrsta verk næstu lotu

1. **Ekki reyna aftur að bóka Festa-skjal 17/480 enn.**
2. Klára read-only duplicate-úttektina þegar Codex/Astra Light er aftur tiltækt.
3. Láta ChatGPT yfirfara niðurstöðuna.
4. Hanna minnstu almennu leiðréttingu:
   - obligation identity aðskilið frá document instance;
   - bæði booking duplicate guard og ingestion duplicate guard skoðuð;
   - venjuleg invoice duplicate-vörn áfram sterk.
5. Bæta synthetic/regression tests:
   - sama unique invoice number → duplicate;
   - sama loan id + sama installment/due date → duplicate;
   - sama loan id + næsti installment/due date → ekki duplicate;
   - enginn vendor-specific Festa-hardcode.
6. Deploy-a litla duplicate-fixið.
7. Bóka síðan Festa 17/480 rétt.
8. Halda áfram að bóka yfirförnu skjölin hjá Benedikt.
9. Eftir marktæka bókunarlotu keyra sama read-only 331-færslu diagnostic snapshot aftur og bera saman við baseline.
10. Aðskilið síðar:
    - rannsaka 3 `DATA_CONFLICT`;
    - rannsaka `pg` deprecation warning;
    - hefja canonical FinancialFacts/DocumentFacts lag.

---

# 38. Dagsniðurstaða

30. september var dagurinn þar sem GLÖGGT fór frá því að **smíða fleiri matching-reglur** yfir í að **mæla sjálft reconciliation-kerfið sem kerfi**.

Það gerðist í þremur stórum skrefum:

### 1. Live reconciliation varð raunverulegt production-flæði

- authorization;
- confirmation;
- payment;
- reconciliation;
- audit;
- UI feedback;
- CHARGE og CREDIT;
- cross-layer evidence;
- document booking context.

### 2. Arkitektúrinn var stöðvaður áður en hann sérsmíðaðist

Þegar hætta var á vendor-/layout-/tungumálssértækum reglum var tekin meðvituð ákvörðun:

> Reconciliation fær canonical facts. Extraction-lagið ber ábyrgð á að finna facts.

Þetta varð grunnurinn að framtíðar FinancialFacts-lagi.

### 3. Við fengum í fyrsta sinn raunverulega coverage-mælingu

Gamla UI sagði:

- 1 sterk;
- 7 mögulegar;
- 323 engar.

Diagnostic snapshotið sagði hins vegar:

- 8 confirmed;
- 19 single-target candidates;
- 3 data conflicts;
- 301 unresolved.

Það sýndi einnig **af hverju** coverage er lágt:

- aðeins 13 eligible booking rows á bankalykli;
- aðeins 34 FinancialEvents;
- 151 skjöl en 94 reviewed/not booked;
- 117 documents án PRIMARY event.

Þetta færir fókusinn frá:

> „Hvernig veikjum við matcherinn svo hann finni meira?“

yfir í:

> **„Hvernig tryggjum við að rétt canonical source facts verði til áður en reconciliation byrjar?“**

Kvöldið bætti síðan við næsta mikilvæga dæmi: sama lán getur framleitt hundruð document instances með sama stöðuga obligation identity. Duplicate-vörn þarf því að skilja **skuldbindingu** frá **einstöku skjali**.

Þetta passar beint inn í stóru stefnu GLÖGGT:

> **Gögn fyrst. Canonical facts næst. Deterministic reglur þar sem þær duga. Mannleg staðfesting þar sem þarf. AI aðeins fyrir raunverulegt túlkunargat.**

**Loka-checkpoint dagsins:** `745f2d3` – Ready / Production.  
**Næsti upphafspunktur:** klára read-only duplicate-úttekt → almenn obligation/document-instance duplicate-fix → bóka Festa gjaldaga 17/480 → halda bókun áfram → endurmæla 331-færslu coverage.
