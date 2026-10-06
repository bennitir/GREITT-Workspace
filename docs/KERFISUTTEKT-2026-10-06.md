# Óháð kerfisúttekt GLÖGGT — 6. október 2026

## Forsendur og aðferð

Úttekt á núverandi vinnueintaki í `C:\GLÖGGT`, byggðu á commit `e2769b6941ca65d792343a392aca1775475d85d4`, með ócommittuðum breytingum og nýjum skrám í document-instance-laginu. Niðurstöður eiga því ekki sjálfkrafa við um útgáfu í rekstri. Forritskóða var ekki breytt.

Kóði og Prisma-líkan höfðu forgang. Rekin voru innlestur, AI/deterministic greining, identity, duplicate, yfirferð, handvirk og AI-bókun, banki/kort, FinancialEvents, VSK og tengd viðmót. Skoðuð voru próf, migrations og staðbundnar Next 16.3 leiðbeiningar um server-action öryggi. Þetta er ítarleg kóðaúttekt á bókhaldssviðinu, ekki fullyrðing um að hver lína allra eininga GLÖGGT hafi verið yfirfarin.

**Sönnunarflokkar:** **S** = staðfest úr kóða; **Á** = sterk ályktun af rekjanlegu flæði; **M** = þarf mælingu eða frekari gögn. Staðfest kóðaslóð merkir ekki að skaðlegt tilvik hafi verið framkallað í rekstri.

**Prófun:** 40 staðbundnar `lib/**/*.test.ts` skrár, að undanskildu PostgreSQL integration-prófi, keyrðar með `node --import tsx --test --test-concurrency=1`. **364 próf stóðust, 0 féllu.** Fyrsta sandbox-keyrsla stöðvaðist í `tsx` á `uv_os_get_passwd/ENOMEM` áður en prófin keyrðu; endurkeyrsla utan sandbox tókst. Ekki voru keyrðar gagnagrunnsskrifanir, production E2E, raunverulegar samhliða bókanir, AI-köll eða afkastapróf gegn rekstrargögnum. Engar staðhæfingar um lagalegt VSK-samræmi eru settar fram; VSK-matið hér er á tæknilegri útfærslu og gagnasamkvæmni.

## A. Executive summary

**GLÖGGT hefur góðan endurnýtanlegan grunn en bókhaldskjarninn er ekki enn nægilega samræmdur til að treysta honum sem almennu, sjálfstæðu bókhaldskerfi við fjölnotendaálag.** Veikasti hlutinn er ekki nýja identity-hugmyndin heldur tengingin milli hennar, eldri server actions og endanlegrar bókunar.

Arkitektúrinn fellur best í **flokk 2: almennt kerfi með sérhæfðum svæðum**, með einkennum flokks 3 í lánatúlkun, nýjum skjalasniðum og endurheimt legacy-gagna. Það væri ósanngjarnt að kalla allt kerfið sérskrifað fyrir eitt fyrirtæki. Það væri líka rangt að kalla það fullalmennt: Festa-regla, fastar kennitölur í ársgreiningu og þröng occurrence-útfærsla eru raunverulegur kóði.

Kerfið getur verið nytsamlegur aðstoðarmaður bókara: varðveitir frumgögn, les þekkt snið án AI, endurnýtir staðfestar tengingar og sýnir tillögur. Sjálfstæðið er þó ójafnt. Ákvörðunarvald er dreift, mörg skref eru handvirk og sumar björgunarleiðir byggjast á því að notandi opni skjal og ræsi viðmótið.

Leit er að hluta deterministic og vel varin gegn ambiguity. Hún er **ekki samræmt hlutlaus eða fullnægjandi**: nýlegustu 100/120 skjöl geta ráðið candidate-valinu, canonical entity-resolver velur eitt af mörgum matches og kortaleit felur víðari kandidata þegar hún finnur sama dag og upphæð.

Afkastavandamál eru staðfest í uppbyggingu: óafmarkaðar heildarleitir, margfeldispörun, endurtekinn PDF-lestur og samstillt AI/worker-vinnsla á request-path. **Raunverulegar 1–3 eða 5–10 sekúndna tafir hafa ekki verið mældar.** Sérstök transaction-slóð getur skapað læsingabið sem líkist því að kerfið hafi stoppað.

Fimm mikilvægustu atriðin:

1. **Critical — heimildir:** notuð server actions vantar object-scope og/eða aðgerðarheimild; handvirk bókun getur farið fram með almennri skrifheimild í öðru fyrirtækjasamhengi.
2. **Critical — bókun:** sama skjal getur farið tvisvar í bókun vegna stöðulestrar fyrir transaction og skorts á source-idempotency innan hennar.
3. **High — bókunarsannleikur:** endanlegar aðgerðir staðfesta ekki allar reiknings- og jafnvægisforsendur; draft, yfirferð, FinancialEvent og ledger geta orðið ósamræmd.
4. **High — identity/duplicate:** legacy-merking og company-wide reikningsnúmer ráða áður en almenn occurrence-sönnun fær tækifæri; nýja lagið leysir fyrst og fremst staðfest lán með prentuðu afborgunarnúmeri.
5. **High — afköst og transaction-mörk:** óafmarkaðar candidate-slóðir og `archiveReceiptFile` með root Prisma client inni í bókunartransaction þurfa endurhönnun áður en magn og sjálfvirkni aukast.

## B. Það sem er vel gert

### 1. Frumskjal, eining, skuldbinding og greiðsla eru aðskildar hugmyndir

**S:** `Receipt`, `AiDetectedDocument`, `InsightEntity`, `FinancialEvent`, `FinancialEventScheduleItem`, `FinancialEventPayment` og `FinancialEventPaymentAllocation` eru aðskilin líkön. Þetta er betri grunnur en að láta hverja kvittun sjálfkrafa vera nýjan kostnað. Sjá `prisma/schema.prisma:279`, `:363`, `:3110` og `:3232`.

### 2. Nýja identity-lagið hefur sterkar öryggisforsendur

**S:** `document-instance-envelope.ts`, `document-instance-service.ts` og `document-instance-evidence.ts` varðveita útgáfu, revision, evidence digest, source hash, binding revision og audit-ankeri. Staðfesting endurheimildar eftir company-lock; CAS kemur í veg fyrir að gamalt revision yfirskrifi nýtt. Request-replay er söguleg aðgerðakvittun, ekki fullyrðing um núverandi stöðu. Prófin ná til fölsunar, scope, rollback, freshness og samtidni í próftvöföldum.

### 3. Afstemming er tillaga þar til maður staðfestir

**S:** Provider-lög skrifa ekki sjálfkrafa bókun eða greiðslu. `event-candidates.ts` skilar `POSSIBLE` jafnvel þegar reference passar. `event-confirmation.ts` endurmetur parið í serializable transaction, kannar úthlutanir og endurkeyrir við serialization conflict. Banka- og kortastaðfesting hafa idempotent same-pair leiðir. Þetta á að varðveita.

### 4. Mutual uniqueness er raunverulega metin

**S:** `candidates.ts` og `reviewed-document-provider.ts` kanna samkeppni báðum megin. Einn candidate fyrir bankafærslu nægir ekki ef sama bókun/skjal passar við aðra bankafærslu. Ambiguity-prófin eru almenn arkitektúrpróf, ekki eingöngu vendor-regressions.

### 5. Sameiginlegt read-model ver systurskjöl

**S:** `reviewed-document-read-model.ts:145` er nýtt bæði fyrir banka og kort. Receipt er container; gögn foreldris mega aðeins fylla í legacy-eyður ef nákvæmlega eitt undirskjal er til. Þetta kemur í veg fyrir að dagsetning eða mótaðili einnar síðu verði sannleikur annarrar.

### 6. „Gögn fyrst“ er að hluta raunveruleg vinnsluregla

**S:** `createReceipt` varðveitir source snapshot; `analyzeReceiptWithAIInternal` reynir deterministic parsers áður en `responses.create` er kallað (`receiptActions.ts:1334`, `:1450`). `runAutomaticInsightForDocuments` endurnýtir afleidd fylgiskjalsgögn ef bókunarlínur eru þegar til. Þekkingarbreyting getur keyrt `reconcileReceiptFromKnownFacts` án AI og frestað AI meðan staðfestingar vantar.

### 7. Réttar tegundir idempotency eru til staðar

**S:** `Receipt.ingestKey @unique` lokar sama-file innlestursrace; banki/kort hafa scoped fingerprint uniqueness; `VoucherNumberReservation` hefur company/voucher uniqueness. Atomic `UPDATE ... RETURNING` úthlutar númerum. Vandinn er að þessar varnir tryggja ekki enn eina bókun á hverja source-einingu.

### 8. Hlutfallsfrádráttur hefur uppbyggðan grunn og audit

**S:** `setDetectedDocumentVatDeduction` geymir 100% grunn, frádráttarhlutfall, fjárhæðir, actor og ástæðu og skrifar audit í sömu transaction og línubreytingar. Það forðast að leggja næsta hlutfall á þegar lækkaðan innskatt. Þetta er góð regla, þótt legacy-textagreining og samhliða breytingar veikji útfærsluna.

## C. Alvarleg vandamál

### C1 — Critical: heimildagloppur í notuðum server actions

**S — staðsetningar:** `app/actions/receiptActions.ts:8374` (`addDetectedDocumentEntry`), `:8496` (`deleteDetectedDocumentEntry`), `:8566` (`deleteReceipt`), `:7599` (`approveManualReceipt`); `app/actions/vatActions.ts:6` (`createVatPeriod`).

- `addDetectedDocumentEntry` hefur enga authentication/company authorization. Það les skjal eftir ID og bætir línu við.
- `deleteDetectedDocumentEntry` og `deleteReceipt` krefjast skrifaðgangs að virku fyrirtæki en tengja ekki target-ID við það fyrirtæki. Aðgangur að A er ekki heimild til að breyta B.
- `approveManualReceipt` notar sömu almennu active-company skrifvörn, les síðan hvaða receipt-ID sem er og bókar hjá fyrirtæki þess. Engin `requireCompanyBookAccess(receipt.companyId)` er þar.
- `createVatPeriod` tekur company-ID frá caller og framkvæmir upsert án auth eða role-check.

Þessar aðgerðir hafa raunverulega UI-callers, meðal annars `DetectedDocumentEntriesEditor`, `ManualReceiptForm`, fylgiskjalssíðu og VSK-síðu. Þetta er því ekki eingöngu dauður legacy-kóði. `proxy.ts` athugar aðeins tilvist session-cookie og er ekki object-authorization. Next-leiðbeiningarnar í `node_modules/next/dist/docs/01-app/02-guides/data-security.md` segja sérstaklega að page-check verndi ekki sjálfstæðar server actions.

**Á — áhrif:** innskráður notandi með aðgang að einu fyrirtæki getur, ef target-ID er þekkt og önnur stöðuskilyrði standast, framkvæmt óheimila breytingu í öðru. Ekki var keyrð árás gegn gagnagrunni. Úrbót er ein sameiginleg server-vörn sem staðfestir actor, target-company og nákvæma aðgerðarheimild áður en breyting hefst.

### C2 — Critical: company-lock lokar ekki tvíbókun sama skjals

**S:** `approveDetectedDocument` les skjal og línur á `receiptActions.ts:7051`, kannar `approvedAt` fyrir transaction og tekur company-lock á `:7130`. Eftir læsinguna er skjalið ekki endurlesið og ekki claim-að með skilyrðinu `approvedAt: null`. `ReceiptEntry.createMany` notar gamla snapshotið á `:7356`. `VoucherNumberReservation` er unique eftir company/voucher en ekki company/sourceType/sourceId (`schema.prisma:1746`).

**Á — rekjanlegt race:** A og B lesa sama óbókaða skjal. A bókar og commit-ar. B fær þá læsinguna en hefur enn gamla `approvedAt = null`. B getur úthlutað öðru voucher-númeri, búið til línurnar aftur og yfirskrifað voucher skjalsins. Duplicate-leitir útiloka eigin document-ID og verja því ekki þetta race. Skjal án reikningsnúmers kemst einnig fram hjá númerstengdum duplicate-checkum. Handvirka leiðin les stöðu fyrir transaction og hefur ekki sambærilegt company-lock.

Úrbót: claim/re-read target undir læsingu, validated revision af línum, ein varanleg posting-eining per source og idempotent niðurstaða við endurtekna beiðni. Númerúthlutun ein sér leysir þetta ekki.

### C3 — High: endanleg bókun er ekki sameiginlegt accounting-invariant hlið

**S:** `approveManualReceipt` kannar að línulisti sé ekki tómur og notar `assertCompanyVatPostingAllowed`; það sannreynir ekki jafnvægi, gilt account hjá target-company, nonnegative/finite fjárhæðir, eina hlið per línu eða nauðsynlega dagsetningu. VSK-helperinn á `receiptActions.ts:953` staðfestir aðeins VSK-skráningarstöðu fyrir reikninga sem hann finnur. Hjá VSK-skráðu fyrirtæki skilar hann strax.

`updateDetectedDocumentEntries` hefur account/jafnvægisprófun (`:8255`), en `approveDetectedDocument` endurframkvæmir hana ekki við posting. Ekki má gera ráð fyrir að hvert draft hafi farið um einn tiltekinn editor. `addDetectedDocumentEntry` getur bætt tómri línu við yfirfarið draft.

**Á:** kerfið getur tekið við bókun sem stenst ekki eigin bókhaldsforsendur. Leggja þarf allar posting-leiðir undir eitt endanlegt invariant-hlið í transaction. Viðmótsprófun er ekki accounting truth.

### C4 — High: archive-aðgerð notar annað database context inni í transaction

**S:** `approveDetectedDocument` uppfærir child/Receipt í `tx`, og kallar síðan `archiveReceiptFile` áður en commit verður (`receiptActions.ts:7476`). Helperinn notar root `prisma` bæði til lesturs og skrifa (`:159`, `:235`) og getur kallað Supabase `.move`.

**Á:** root-lesturinn sér almennt ekki ócommittaða síðustu samþykkt; við venjulega síðustu bókun getur helperinn því séð eldra skjal og sleppt archive. Ef root-update leiðin næst þegar ytri transaction heldur row-lock á sama Receipt getur hún beðið eftir commit sem ytri transaction bíður sjálf eftir. Storage move er auk þess ekki hluti af database rollback.

**M:** tíðni og raunveruleg bið þurfa profiling/transaction trace. Þetta er staðfest rangt transaction-mynstur, ekki staðfest production-deadlock. Flytja þarf archive í idempotent eftir-commit job/outbox, og hafa database truth óháðan því hvort skráarfærsla tókst.

### C5 — High: legacy duplicate kemur á undan occurrence-identity

**S:** við innlestur nægir `sameStrongMerchant` ásamt sama normalized reference til duplicate-merkingar, án sömu dagsetningar/upphæðar (`receiptActions.ts:2652–2695`). Yfirferð og posting stoppa strax á `duplicateMarkedAt` (`:5776`, `:7080`), en identity-preparation kemur síðar (`:7116`). Canonical nýtt greiðslutilvik fær því ekki tækifæri til að leiðrétta merkinguna sjálfkrafa.

Við posting er sama `receiptNumber` blocking hjá öllu fyrirtækinu, án útgefandascope (`:7189`). Tveir óháðir birgjar með reikning 1001 geta því lent í árekstri. Undantekningin krefst staðfestrar loan-binding og afborgunarnúmers á báðum skjölum.

**Á:** lögleg ný lánagreiðsla getur stöðvast áður en nýja identity-lagið er metið; löglegir reikningar frá ólíkum útgefendum geta líka stöðvast. Lausnin er almenn reference-semantics og issuer/obligation/occurrence scope, ekki fleiri sérreglur.

### C6 — High: canonical resolver velur ambiguity en annað lag hafnar henni

**S:** `resolveCanonicalInsightEntity` safnar identifier-matches og `choosePreferredCandidate` velur confirmed, canonical type, svo lægsta ID (`lib/insight/entity-identity.ts:208`, `:294`). Það hafnar ekki tveimur confirmed matches. `findKnownEntityByStrongIdentifier` í `lib/receipts/reconciliation.ts:45` hafnar hins vegar fleiri en einu confirmed match.

`InsightEntity` hefur index en engan unique canonical identifier (`schema.prisma`, model `InsightEntity`). Resolverinn gerir read-then-create án eigin unique constraint eða sameiginlegs identity-locks.

**Á:** eining getur verið valin við innlestur en talin ambiguous við endurútreikning; samtímis innlestur getur stofnað semantic duplicates. Identifier scope vantar einnig issuer-namespace fyrir meðal annars lán/skírteini/samningsnúmer sem eru ekki endilega company-wide unique hjá ólíkum útgefendum. Kennitala er sterk global identity; loan-number eitt sér þarf ekki að vera það.

### C7 — High: yfirferð, draft og FinancialEvent geta orðið ósamræmd

**S:** `reviewDetectedDocument` materialize-ar FinancialEvent og lærir account-val. `updateDetectedDocumentEntries` og `setDetectedDocumentVatDeduction` banna breytingar eftir posting en ekki eftir review. Þau hreinsa ekki `reviewedAt` við breytingu. `materializeReviewedFinancialDocument` skilar án uppfærslu ef PRIMARY link er þegar til (`financial-event-materialization.ts:131`).

**Á — dæmi:** skjal er yfirfarið sem 10.000 kr. og FinancialEvent stofnaður. Síðar breytir bókari draft í 12.000 kr. Skjalið heldur review, event getur haldið 10.000 kr. og bókun síðan tekið nýju línurnar. Nýja bankaleitin getur því leitað eftir öðrum sannleika en bókunin. Hliðstæð hætta er við breytt skuldareikningsval og VSK-frádrátt.

Review þarf að vera staðfesting á tilteknu content-revision, ekki aðeins timestamp. Breyting þarf að ógilda samþykkt og stale-a viðeigandi afleidd gögn.

### C8 — High: workflow-stillingar eru ekki endanlega framfylgt

**S:** `getOutstandingBookkeepingControls` er skilgreint í `lib/core/bookkeeping-workflow.ts:55` en leit yfir `app`/`lib` fann enga notkun þess. Stillingar um review, reconciliation, expense approval og `AUTO_BOOK` eru lesnar á stillingasíðum. Posting-aðgerðirnar tengjast þeim ekki. `reviewDetectedDocument` krefst `canBookEntries`, ekki sérstaklega `canReviewBookkeeping`.

**Á:** fyrirtæki getur krafist afstemmingar/samþykkis í stillingum án þess að posting stöðvist þegar þau vantar; aðskilnaður ábyrgðar birtist í UI en er ekki sameiginleg server-policy. Þetta er alvarlegt jafnvel þótt handvirkur vinnusiður bæti það tímabundið upp.

### C9 — High: candidate-leit er sums staðar óafmörkuð og annars of þröng

**S:** ingest duplicate fallback velur nýjustu 100 skjöl fyrirtækisins áður en reference/merchant er metið. Það getur misst af eldra réttu duplicate. Recurring/history leið velur 120 nýjustu yfirfarnar niðurstöður áður en merchant-saga er afmörkuð (`receiptActions.ts:5000`). Prompt notar 12 review-dæmi og 40 nýleg accounting patterns.

Á móti sækja reconciliation services allt bankasafn og allt viðeigandi bókun/event/skjalasafn án tímabils. Pure grafar geta síðan metið N×M pör og endursíað kandidata per færslu.

Úrbót: indexuð discovery eftir scoped canonical facts og fjárhæð/tímabili, aðskilin frá evidence-ranking. Takmörk mega ekki gera rétta sönnun ósýnilega.

### C10 — Medium: exact-date rule felur sterkari víðari kortasönnun

**S:** `buildCardReviewedDocumentCandidateGraph` á `card-reviewed-document-provider.ts:343` skilar exact-date candidates strax, jafnvel þótt eini slíki kandidat sé amount/date fallback með óstaðfestum aðila. Það fellir einnig non-exact edges að document með exact edge áður en uniqueness er reiknuð.

**Á — mótdæmi:** kort sýnir upphæð X á D; skjal frá röngum birgi á D með X fær POSSIBLE. Rétti birgirinn á D−1 með X og sterkari identity fær ekki að vera með í sýnilegum grafi. Röðun eftir nálægri dagsetningu er eðlileg; að fela aðra sönnun er ekki almennt rétt. Þetta bókar ekki sjálfkrafa, en getur skapað false negative og fölsk uniqueness.

### C11 — Medium: banka- og kortastaðfesting nota mismunandi eligibility

**S:** `card-reviewed-document-confirmation.ts:74` hafnar duplicate/disposed skjölum. `reviewed-document-confirmation.ts:88` kannar review/amount/PRIMARY en hefur ekki sömu duplicate/disposition-varnir. Automatic read-model útilokar þau samt.

**Á:** endurtekin eða gömul bankastaðfestingarbeiðni getur tengt skjal sem providerinn myndi nú hafna. Handvirk staðfesting má rýmka matching, en á ekki að sleppa disposition/duplicate consistency.

### C12 — Medium: VSK og legacy ledger velja mismunandi staðreyndalög

**S:** VSK-síða notar approved child `bookingEntries` og sleppir ReceiptEntry fallback fyrir allt receipt ef eitthvert approved child hefur línur (`app/vsk/page.tsx:422`, `lib/vat/receipt-selection.ts`). Banki→bókun notar aðeins ReceiptEntry þar sem foreldri er `APPROVED` (`financial-reconciliation/source.ts:127`) og dagsetningu/mótaðila foreldris.

**Á:** þegar ein síða fjölskjala-PDF er bókuð en aðrar óbókaðar getur VSK séð bókunina en banki→ledger ekki. Í blönduðu legacy receipt með sumum child-línum og öðrum aðeins í ReceiptEntry getur VSK sleppt hluta ledger-gagna. Vantar nákvæma document/posting tengingu fyrir hverja ledger-línu.

### C13 — Medium: sérhæfing og textamerking ráða of miklu

**S:** Festa suffix-regla er bæði í prompt (`receiptActions.ts:1527`) og executable code (`:3168`). Ársgreining hefur fastar kennitölur og sérstök mótaðilanöfn sem gefa `HIGH` confidence og „confirmed“ evidence (`app/banki/_lib/analysis/annual.ts:521`). Þetta eru ekki tenant-config gögn. Þessar greiningar eru vísbendingar; ekki var sýnt fram á að þær bóki sjálfkrafa.

VSK legacy-útfærsla þekkir ófrádráttarbæran VSK og móti-VSK með línutexta; payment terms eru að hluta endurunnin úr summary/booking text. Slíkt er góð migration-björgun en veikt varanlegt authority-lag.

### C14 — Low: dauðar/eldri aðgerðir og villutexti auka óvissu

**S:** `approveAiSuggestion`, `markReceiptReviewed`, `saveOcrResult` og `addReceiptEntries` eru exported legacy-leiðir; leit fann ekki callers þeirra utan sömu action-skrár. Sumar vantar auth. Next-build getur tree-shake-að ónotaðar actions, svo þær eru ekki sjálfkrafa staðfest opin production-endpoint. Þær ættu engu að síður að hverfa eða vera innri, varðar aðgerðir áður en einhver endurnýtir þær.

Villur eins og `IDENTITY_*`, `MANUAL_RECONCILIATION_REQUIRES_EXACT_AMOUNT` og `SOURCE_UNAVAILABLE` eru gagnlegar fyrir logging en þurfa samræmda notendaskýringu og næsta skref. Blanket catch í reviewed-document service felur ástæðu bilunar frá niðurstöðu caller.

## D. Almenn kerfisúttekt

### 1. Almenn notkun og nýtt fyrirtæki

Nýtt fyrirtæki getur án kóðabreytinga fengið company-scope, reikningslykil, heimildir, handvirk skjöl, almenna AI-lestur, staðfestar entity/account tengingar og hluta deterministic sniðanna. Það er raunverulegur almennur grunnur.

Óþekkt bankasnið er ekki jafngilt nýju bankanafni: `previewBankStatement`/kortainnflutningur nota fasta dálka-aliaslista og XLSX-vinnslu, ekki almennt configurable feed-adapter kerfi. Nýtt skjalasnið getur fallið í AI/manual review. Ný occurrence-merking utan staðfests láns með prentaðri sequence er ekki leyst af nýja identity-adapternum. Ekki er hægt að gefa trúverðuga prósentu sjálfvirkninnar án blindra onboarding-prófa á óþekktum gögnum.

Sérhæfður skjalaparser er í sjálfu sér eðlilegur adapter. Vandinn byrjar þegar hann ákvarðar almennan sannleika, eða vendor-nöfn/kennitala ráða bókhaldsmerkingu í kjarnanum. Festa-reglan er slík executable sérregla; Nova-lík prófgögn fyrir almenna labeled parserinn eru ekki sjálfkrafa slík regla.

### 2. Leit, matching og candidate-val

| Viðfang | Núverandi slóð | Mat |
|---|---|---|
| Sama frumskrá | company/fileHash + ingestKey | Sterk byte-idempotency; nær ekki öllum endurskönnunum. |
| Duplicate við innlestur | fingerprint `findFirst`, annars nýjustu 100 | Early shortcut og aldursbias; reference/KT er of ráðandi. |
| Duplicate við posting | company-wide exact receiptNumber + identity á þeim pörum | Allir númer-kandidatar metnir, en discovery og issuer-scope ófullnægjandi. |
| Canonical entities | company/type heildarleit, normalization í minni, preferred match | Alias-styrkur góður; ambiguity-policy ósamræmd og identity namespace þröngt. |
| Bókanir | bank-linked account + ReceiptEntry í APPROVED Receipt | Rétt signed amount; hard ledger selection er eðlileg fyrir þetta flow, en nær ekki canonical event-proof á öðrum lykli. |
| Bankafærslur | account-scope, oft allar færslur | Company-scope almennt til staðar í read-services; engin sameiginleg afmörkun. |
| Kortafærslur | exact date/abs amount index + wider fallback | Góð bucket-hugmynd; exact dominance getur falið réttari evidence. |
| FinancialEvents | CHARGE/CREDIT, ISK, full amount, ≤30 dagar | Deterministic tillögur; þröng leið fyrir installments, partial payments, FX og langan greiðslufrest. |
| Yfirfarin skjöl | sameiginlegt read-model, abs amount, ≤30 dagar, reference/KT/party/history | Betri sameiginlegur sannleikur; partial/aggregate matching vantar í þessari leið. |
| Lærdómur | AccountingPattern + nýleg skjöl + staðfest reconciliation metadata | Almenn company-local þekking, en candidate/recency caps geta útilokað rétta sögu. |

Bank→booking notar rétt `debit-credit` formerki. Bank→FinancialEvent sannreynir gagnstæða átt skuldbindingar/greiðslu. Reviewed bank/card bridge notar absolute amount og hefur ekki sama almenna direction invariant; útgreiðsla og endurgreiðsla með sömu absolute upphæð geta því verið kandidaten að sömu heimildartegund. Handvirk staðfesting er mikilvæg en leiðréttir ekki sjálfkrafa rangar tillögur.

Sama leit er að hluta endurnýtt, einkum read-model/normalization. Endanleg matching-policy er þó ólík í ledger, event, bank bridge, card bridge, entity resolution og receipt known-facts reconciliation. „Eitt canonical lag“ er því enn stefna, ekki fullkomlega uppfyllt niðurstaða.

### 3. Skuldbinding → greiðslutilvik → skjal

Líkanið getur tjáð þetta. PaymentSchedule/FinancialEvent/Payment tengingar styðja að eitt skjal sé ekki nýr kostnaður. Nýja document-instance JSON-contractið er líka skýrt um að date, amount og document-ID séu ekki occurrence-lykill.

Production-adapterinn þrengir samt binding að `LOAN`, `LOAN_NUMBER`, ACTIVE og CONFIRMED (`document-instance-prisma.ts`, `toServiceDocument`). Eina instance-tegundin er `PRINTED_INSTALLMENT_SEQUENCE`. Mismunandi heildarfjöldi afborgana skilar insufficient evidence, sem er rétt varfærni en sýnir að endurskoðaðar greiðsluáætlanir hafa ekki almenna identity.

**Mat:** canonical obligation + occurrence + source evidence er góð grunnhugsun, en ekki enn almenn vél fyrir tryggingartímabil, áskriftir, samninga, mæla, partial payments eða mörg skjöl sama tilviks. Vendor-dæmi eiga að vera acceptance corpus eftir að þessi semantics eru skilgreind.

### 4. Duplicate-vörn í heildarflæði

Röðin er file hash → extracted fingerprint/dedupe → ingest duplicate mark → review block → posting precheck → optional loan-instance preparation → number/heuristic checks. Eldri ákvarðanir ráða því enn að hluta áður en canonical identity er lesin.

`buildDetectedDocumentFingerprint` (`ingestion.ts:1547`) notar merchant/reference/date/amount þegar reference er til. Prentuð sequence er ekki þar. `dedupeDetectedDocuments` fellir sama fingerprint úr einu analysis-svari áður en bókunaridentity kemur til sögunnar (`receiptActions.ts:2185`). Tvö lögleg occurrence með sömu þessum reitum geta því runnið saman; tveir lestrar sama skjals með breyttri AI-date/amount geta fengið mismunandi fingerprint.

Nýja pure duplicate-vélin gerir rétt að láta DISTINCT aðeins fella obligation-reference reason og halda öðrum evidence. En raunverulegt candidate-discovery leitar ekki almennt eftir canonical occurrence ef receiptNumber breytist. Pure prófið „same instance án number-match“ sannar ekki að production-leit finni það par.

Fail-closed hefur tvær hliðar: stöðva ósannað duplicate-override er gott; að meðhöndla company-wide reikningsnúmer eða endurtekið obligation reference sem næga duplicate-sönnun er ekki almennt rétt. Óvissa á að skapa review, með skýrum facts, ekki fela sig sem endanleg identity.

### 5. Sjálfstæði með bókara

Kerfið getur sjálft lesið þekkt snið, búið til tillögur, fundið ýmis exact matches, afleitt Innsýn og endurnýtt staðfestar tengingar. Bókari þarf eðlilega að staðfesta viðskiptaumhverfi, lán-/skuldareikning, óljósa greiðslureikninga, VSK-notkun og ambiguous reconciliation.

Óeðlileg handvinna er að hafna duplicate-merkingu áður en kerfið reynir sönnun sem það getur þegar átt; opna skjal til að keyra client-effect sem fyllir bókunartillögu; færa eldri óbókuð skjöl til hliðar til að halda tímaröð áfram; og endurtaka yfirferð sem er ekki bundin við revision. Evidence/diagnostics eru ágætlega til staðar, en provenance er ekki jafnt auðvelt að lesa á öllum slóðum.

Recurring engine krefst tveggja samhljóða fyrri línu-/upphæðarsniðs og getur varðveitt debit-side þótt credit-side breytist (`recurring-booking.ts`). Það er góður almennur varfærinn lærdómur, en þolir illa eðlilega verðbreytingu. Sjálfstæði gagnvart forritara þarf blind acceptance suite, ekki fleiri jákvæð raunveruleg dæmi eitt í einu.

### 6. Bókhaldslegar forsendur og gagnalíkan

Posted ReceiptEntry hefur aðeins parent receipt; ekki document/posting ID, account foreign key, currency eða source revision. Voucher metadata er á öðrum lögum. Fyrir fjölskjala-PDF verður erfitt að rekja hverja ledger-línu til einnar endanlegrar bókunar án audit/afleiddrar röðunar.

Fjárhæðir eru `Float` í Receipt/entries og `Decimal` í banka/FinancialEvent. Bank→booking notar `Number` og round-to-minor, meðan event/bridge lög nota string/BigInt eða Decimal. Þetta er ósamræmi í monetary semantics; ekki sönnun fyrir stórri skekkju í núverandi ISK-gögnum. Velja þarf eina nákvæma monetary contract og miðstýrða rounding policy.

VSK-hlutfall á skjali er réttara en global account-default. Legacy-línutexti og snapshot-entry-ID gera grunninn hins vegar brothættan þegar línur eru endurskrifaðar eða sama ID fær nýtt gildi. Núverandi ID-freshness kanna tilvist, ekki að fjárhæð og merking séu óbreytt. Review, deduction metadata, ledger og event þurfa sameiginlega content-revision vernd.

Fastir `2510`, `2520`, `2590`, `3000` koma enn fyrir í VAT/posting logic (`receiptActions.ts:7369`, `app/vsk/page.tsx:371`). Hlutverk/type-based selection er annars til staðar. Nýtt chart of accounts er því aðeins að hluta configuration.

### 7. Afköst

Sjá H. Staðfest eru þung vinnslumynstur; engin raunveruleg response-time dreifing er mæld. Engin gagnagrunnsstaðhæfing um full-table scan er rétt án query-plan, jafnvel þótt forritið sæki allar viðeigandi company-færslur.

### 8. Flækjustig og viðhald

`receiptActions.ts` er yfir 9.000 línur og sér um storage, PDF, AI prompt, identity, learning, birgðir, VSK, entity/account profile, review og posting. Nýr forritari getur ekki með hæfilegu öryggi lesið eina þjónustu og vitað hvaða lag hefur endanlegt ákvörðunarvald.

Nýjar pure einingar eru skýrari og vel prófaðar. Hins vegar færist legacy-bootstrap inn á heita posting-slóð í stað migration-verks; comments í identity-skrám segja enn „no production caller“ þótt vinnueintakið hafi wiring. Það er skjalaóreiða, ekki sönnun um að nýja kóðann megi hunsa.

Sameina þarf policy/invariants, ekki endilega allar services í eina stórþjónustu. Adapter-sérhæfing, discovery, evidence evaluation, review og posting eiga að hafa afmarkaða ábyrgð.

### 9. Prófanir

**Góð architecture-próf:** ambiguity báðum megin, foreign company, Decimal nákvæmni, óstaðfest identity, stale revision, audit mismatch, rollback, request replay og serialization retry.

**Regressions:** 338379/16–17 af 480, Olís/Visa, HS og Nova-lík skjöl. Slík próf eru nauðsynleg sem dæmi, en festa ekki sjálfkrafa góða almenna policy. Sérstaklega staðfesta kortapróf exact-date dominance; vantar mótdæmi með röngum sama-dags aðila og sterkari réttum aðila á öðrum degi.

**Takmarkanir:** mikill hluti service-tests notar in-memory Prisma delegates. Að prófa að `Serializable` option sé sett og herma P2034 sannar ekki concurrency í raunverulegum PostgreSQL. `document-instance-postgres.integration.test.ts` er til, með skýrum test-DB write-gate; það var ekki keyrt og prófar ekki allt posting-flæðið. Ekkert sérstakt accounting server-action authorization eða production E2E-prófasafn fannst í skráayfirlitinu.

**Nauðsynleg acceptance cases:** óþekkt fyrirtæki/banki; sama invoice number hjá tveimur útgefendum; tvær confirmed entities með sama númeri; sama occurrence með breyttu reference; ný occurrence með sama reference; samtímis posting; draft-breyting eftir review; bank/card confirmation eftir disposition; blandað legacy/child ledger; verðbreyting með sama þjónustusniði; partial/batched/FX greiðslur.

### 10. AI og deterministic vinnsla

Gögn-fyrst er virt á mikilvægum slóðum en ekki sem algild regla. Í greiningu eru company-history, policies og patterns undirbúin áður en deterministic gate liggur fyrir; 0-AI getur því samt verið database/network-þungt. Source buffer er sótt þótt source text sé cached. Deterministic fallback og canonical reuse eru til staðar en þekkt snið eru afmörkuð.

Deep-insight worker er stundum keyrður beint innan upload-flæðis. Nýtt „queue“ jafngildir því ekki alltaf asynchronous notendaflæði. General AI-lestur og sér-Innsýn geta orðið samfelld bið.

Nýja reviewed-text identity fallback sannreynir hash frumskrár og digest/timestamp summary. Það sannar að nákvæmlega sami yfirfarni texti sé notaður; **það sannar ekki sjálft að AI-samantekt hafi rétt prentað occurrence úr PDF**. `prepareOneLoanDocumentInstanceIdentity` staðfestir identity sjálfvirkt undir actor bókunarbeiðnar. Þetta þarf skýra trust-policy: staðfesting bókunartillögu er ekki endilega sértæk staðfesting allra identity-facts í summary. Hash styrkir rekjanleika, ekki sannleiksgildi útdráttar.

### 11. Öryggi, audit og samtímis vinnsla

Company-scope er almennt skýrt í nýjum reconciliation services. Actions bera ábyrgð á auth fyrir innri cores; það er ásættanlegt contract þegar öll inngangspunktar fylgja því. Nú gera þeir það ekki alls staðar.

Bank/card context við innflutning kannar membership en ekki granular upload/write-role. VIEWER membership getur því komist að mutation þar sem viðbótarcheck vantar. Reconciliation actions hafa hins vegar `canReconcileBookkeeping` checks. Bank/card context notar raunverulegan session-user, meðan aðrir hlutar nota effective impersonated-user; audit actor og heimildasamhengi geta því verið ólík við admin-impersonation.

Audit er sterkt í nýrri staðfestingu en ekki samræmt í draft-edit/delete og legacy-leiðum. Draft deletion er hard delete með cascades. Það þarf að ákveða hvað er tímabundið draft og hvaða reviewed evidence/learning þarf að halda eftir sem tombstone, svo uppruni lærdóms glatist ekki.

Identity company-lock er ekki tekið af öllum metadata/entity-link writers: VAT/edit/review/ingestion hafa önnur transaction-mörk. Athugasemd „shared lock kemur í veg fyrir evidence-breytingu“ gildir aðeins um writers sem raunverulega taka læsinguna. Samhliða metadata merge getur tapað JSON breytingu ef tvær leiðir skrifa gamla heildarsnapshotið.

### 12. Notendaflæði

Kostir: frumskjal við hlið review, sýnilegt VSK-hlutfall, needs-attention biðröð, explicit ambiguity, manual confirmation og diagnosis eru nytsamleg.

Veikleikar: upload getur beðið eftir AI og deep insight; recurring suggestion byrjar í `useEffect` við opnun og villan fer í console (`DetectedDocumentEntriesEditor.tsx:258`); client `router.refresh` keyrir í kjölfar actions sem einnig revalidate-a; company-wide chronology stöðvar seinna skjal vegna eldra unrelated óbókaðs skjals (`receiptActions.ts:7265`). Needs-attention undanþága hjálpar en skapar aukaskref.

Ekki er sannað að React hydration sé aðalflöskuháls. Þung server-read og PDF-vinnsla eru mun skýrari rannsóknarslóðir. Mæla skal render/payload fyrst, svo breyta refresh-policy ef gögn sýna ávinning.

### 13. Viðbótarfundir

Alias-index í `reviewed-document-read-model.ts:120` er búið til úr öllum input-röðum **áður en** duplicate/disposed raðir eru felldar út í materialization. Eldra, nú óhæft skjal getur því enn lagt merchant-alias inn í aðrar hæfar niðurstöður. Alias-registry þarf hæfis- og provenance-reglur, ekki aðeins current result filtering.

Global product knowledge er viljandi cross-company. Það miðlar ekki beint fyrirtækisbundnu account-valinu, sem er gott. `CONSUMABLE → FOOD_SERVICE` er þó viðskiptamerking sem þarf ekki að gilda í öllum fyrirtækjum (`product-knowledge.ts:492`). PII-regex er varfærnisvörn, ekki sönnun fyrir að öll frjáls product descriptions séu ópersónuleg. Þessu þarf að fylgja skýr sharing/trust-policy; ekki var staðfest gagnaleki.

## E. Generic vs bespoke mat

**6/10. Flokkur 2, með flokks-3 áhættu á sérhæfðum svæðum.**

Plús: company-scoped data, configurable accounts/permissions, general AI/manual fallback, almenn canonical entity-hugmynd, reusable matchers og company-local learning.

Mínus: executable Festa-regla; fastar supplier-kennitalnaflokkanir; þröng loan occurrence-binding; föst reikningsnúmer; bankasnið ekki almennt configurable; legacy-repair á posting-slóð; nýtt evidence sem fellur utan núverandi labels/sequence leiðir til frekari sérvinnu.

Nýtt fyrirtæki getur hafið notkun án forritara, einkum handvirka skráningu og AI-assisted review. Ekki er nægileg sönnun fyrir því að það geti fengið áreiðanlega almennan sjálfvirkan innlestur, duplicate og afstemmingu með óþekktum sniðum án reglulegrar aðstoðar. Einkunnin er faglegt mat úr kóða, ekki mæld acceptance-prósenta.

## F. Sjálfstæði kerfisins

**5/10 fyrir sjálfstæða vinnu með bókara án reglulegs inngrips forritara.**

Það er meira en skref-fyrir-skref formkerfi: deterministic parsing, known-facts reconciliation, lærð account patterns og read-only candidates gera raunverulega vinnu. Það er enn minna en traust almenn sjálfstæð vél: þekking er ekki samræmt authority, review er timestamp en ekki revision, false duplicate krefst handvirkrar björgunar og óþekkt recurrence/namespace fellur utan nýja lagsins.

Bókari á áfram að staðfesta faglega meðferð og ambiguity. Forritari á ekki að þurfa að bæta vendor-reglu vegna þess að einn reitur merkir obligation en ekki occurrence. Þar liggur mesta tækifærið til að hækka einkunnina.

## G. Leit og hlutleysi

| Svið | Einkunn | Rök |
|---|---:|---|
| Candidate discovery | **5/10** | Ný shared read-models góð; 100/120 caps, exact dominance og heildarleitir ójafnar. |
| Canonical matching | **6/10** | Alias-strength/provenance til staðar; ambiguity-resolvers ósamræmdir og namespace/uniqueness ófullnægjandi. |
| Duplicate detection | **4/10** | File-idempotency sterk; legacy number/KT heuristic, early block og occurrence-discovery veik. |
| Reconciliation matching | **6/10** | Signed ledger matching og conservative events; partial/FX/schedule coverage þröngt og provider-policy ólík. |
| Hlutleysi gagnvart fyrirtækjum/vendors | **5/10** | Company-local learning almenn; executable vendor/KT-reglur og context assumptions draga niður. |
| Fail-closed hegðun | **5/10** | Ný evidence/confirmation cores 8/10 að uppbyggingu; end-to-end auth/posting/review gloppur draga heild niður. |

Fail-closed einkunn er ekki verðlaun fyrir að loka öllu. Rétt hegðun er að krefjast sönnunar á réttu sviði og útskýra óvissu; false duplicate úr röngu namespace er einnig rang niðurstaða.

## H. Performance

Tímabilin hér eru **rannsóknarflokkar líklegra áhrifa**, ekki mæld loforð. Há confidence á kóðamynstri getur farið saman við ómælda tímalengd.

| Staðsetning | Hvað gerist / hvers vegna þungt | Líkleg áhrif | Sönnun/confidence | Mæling eða úrbót |
|---|---|---|---|---|
| `receiptActions.ts:7476` → `archiveReceiptFile:159` | Root Prisma inni í tx; möguleg row-lock bið og storage I/O meðan company-lock haldið | Mjög löng bið eða timeout ef root-write branch næst; annars archive getur sleppst | S mynstur; Á áhrif; M tíðni | Trace connections/locks og storage; archive eftir commit með outbox. |
| `app/banki/[id]/afstemming/page.tsx:133` | Átta þjónustur í parallel, margar lesa sömu heildargögn; parallel eyðir ekki vinnu | 1–3 s við miðlungs gögn; 5–10 s eða meira með magni/network/pool-pressure | S duplicated workloads; M sekúndur | Query count/bytes/pool wait, p50/p95; eitt scoped snapshot og lazy diagnostics. |
| `source.ts:110`, `event-service.ts:70`, `reviewed-document-service.ts:69` | Óafmarkaðar bankafærslur, ledger/events/documents; stór select/includes | Stækkandi database og payload töf | S; M query-plan | Period/cursor/amount windows; EXPLAIN ANALYZE í test-DB. |
| `candidates.ts`, `event-candidates.ts`, `reviewed-document-provider.ts:294` | N×M pör; sum grafalög sía allan candidate-lista aftur per banka | 5–10 s eða meira við stór söfn; CPU getur lokað Node event loop | S complexity; M raunhraði | Benchmark 1k/10k/50k; amount/date buckets, adjacency maps. Ekki arbitrary top-100. |
| `skjalasafn/page.tsx:89`, `:551` | Öll receipts, company, entries, children og bookingEntries; filter/sort í minni eftir fetch | 1–3 s, síðan 5–10 s eða meira með vexti | S; M magn/tími | Server-side where/sort/pagination og þröng select; mæla result bytes/render. |
| `receiptActions.ts:338`, `:441`, `:254` | PDF snapshot/upload/analysis og sequential automatic insight, stundum worker/AI innan sama request | Mjög löng bið; AI timeout 180 s er til staðar | S request dependency; M raunbið | Job-ID strax, bakgrunnsvinnsla með progress, mæla hvert stage. |
| `document-instance-booking.ts:753` | Við endurtekið reference eru fyrri skjöl bootstrap/undirbúin í röð; artifact/PDF/evidence og audits | 5–10 s eða meira fyrir sögu; notandi gæti upplifað „stoppað“ | S sequential/IO; M tímaáhrif | Precompute identity við review; scoped indexed occurrence; bounded migration job. |
| `receiptActions.ts:5078` | Allt að 12 fyrri PDFs sótt og lesin sequential; cache-repair aðeins í minni | 1–3 s per nokkur gögn; 5–10 s eða meira samanlagt | S; M storage/PDF kostnaður | Cache per sourceHash/parserVersion/page; sama PDF aðeins einu sinni. |
| `banki/actions.ts:290` | Per row lookup og insert utan batch-transaction | N+1; stór innflutningur mjög hægur og partial progress við villu | S; M sekúndur | Bounded batches, atomic batch claim, safe bulk insert, row throughput. |
| `insight/entity-identity.ts:255`, `receipts/reconciliation.ts:57` | Allar active entities af type sóttar/canonicalized aftur per entity/policy | N+1 / quadratic growth innan fjölskjala vinnslu | S; M umfangi | Stored normalized keys + unique namespace; request map/cache. |
| `DetectedDocumentEntriesEditor.tsx:258` | Suggestion í hydration effect; action + refresh í kjölfar server render | Auka request/1–3 s hugsanleg töf og sýnileg formbreyting | S flæði; M tími | Network/render trace; precompute áður en review er birt. |
| `withReceiptAnalysisLease:3420` | 5 mín lease án heartbeat; langt AI + margar aðgerðir | Við vinnslu >5 mín getur annar lestur byrjað | S lease; M hvort mörk nást | Duration histogram; renewal/fencing token, durable jobs. |

**Staðfest production-bottleneck í sekúndum:** ekkert, þar sem profiling vantar. **Staðfest óskalanleg/þung mynstur:** mörg eins og taflan sýnir. **Mest líklegur „nánast stoppar“ vandi:** archive transaction-mörk, request-bound AI/worker og margfeldispörun við vaxandi magn.

## I. Tækniskuld

| Aðgerð | Hvað |
|---|---|
| **Varðveita** | Source hash/snapshot; company-scope; explicit review; pure evidence contracts; audit/CAS/replay; read-only candidates; serializable confirmation og exact monetary helpers. |
| **Einfalda** | Receipt status/child state; stór prompt/history assembly; error mapping; refresh-flæði; endurtekna artifact/PDF-lestur. |
| **Sameina** | Authorization á target object; posting invariants; canonical ambiguity-policy; review-revision; banka/korta eligibility; monetary/rounding contracts. |
| **Endurhanna** | Posting aggregate með source-idempotency; obligation/reference/occurrence namespace; discovery/ranking mörk; async jobs/outbox; ledger-line → document/posting tengingu. |
| **Flytja í gögn/adapters** | Vendor aliases, staðfest counterparty-purpose, bankasnið, chart-of-accounts roles og skjalatemplate registry. |
| **Fjarlægja eftir staðfesta yfirfærslu** | Ónotaðar exported legacy-actions; hot-path legacy bootstrap; duplicated company setting truth; úrelt comments/compatibility branches. |

Ekki sameina allt í einn „canonical mega-service“. Skýr mörk og einn policy-sannleikur eru markmiðið. FinancialEvent, posting og reconciliation eiga að vera áfram aðskilin verk með explicit tengingum.

## J. Forgangsröðuð aðgerðaráætlun

### 1. Verður að laga áður en arkitektúr/sjálfvirkni þróast lengra

1. **Loka C1 og role-gloppum.** Allar mutations fá auth + target-company + exact capability. Acceptance: aðgangur að A leyfir enga breytingu í B; VIEWER má ekki import/book/delete; page/proxy-vörn skiptir ekki máli fyrir action-test.
2. **Ein endanleg posting-þjónusta.** Re-read/claim undir transaction, source uniqueness, review-content revision, valid accounts, exact amount/balance, date, workflow-policy, audit í sömu atomic skrifum. Acceptance: tvær samhliða beiðnir gefa eina bókun og sömu niðurstöðu við retry.
3. **Taka archive/storage út úr posting transaction.** Durable outbox og idempotent worker. Acceptance: storage failure breytir ekki bókunarsannleika og retry endurheimtir archive án tvíbókunar.
4. **Ákveða canonical identity namespace og reference-semantics.** Issuer/obligation/occurrence/source eru explicit facts; same invoice number hjá tveimur birgjum á ekki að verða duplicate. Heildarflæði metur evidence áður en legacy heuristic lokar.
5. **Samræma review og afleidd gögn.** Breytt draft ógildir review/learning readiness og merkir event/identity stale eftir merkingu. Bank confirmation hafnar disposed/duplicate eins og card.

### 2. Laga fljótlega

1. Sameina canonical resolver ambiguity-reglur; unique normalized keys með réttu namespace; migration/dedup með rekjanlegri mannlegri staðfestingu við árekstur.
2. Fjarlægja exact-date candidate-hiding; raða evidence en varðveita conflicting candidates og sýna ástæðu útilokunar.
3. Skipta heildarleitum í scoped snapshots, date/amount buckets og pagination. Setja p50/p95, query count, pool wait, PDF time og AI time á allar helstu actions.
4. Cache-a parsing eftir source hash/parser-version/page, ekki aðeins eftir skjal-ID; keyra innlestur/deep insight í jobs.
5. Flytja legacy-binding migration af posting-path; sýna unavailable evidence sem review-gap.
6. Framfylgja workflow/permission controls og sýna aðeins stillingar sem hafa virka server-merkingu.
7. Byggja end-to-end test matrix á raunverulegum sérmerktum test-PostgreSQL; mest áríðandi eru concurrency og action-authorization.

### 3. Má bíða eftir þessum grunnviðgerðum

1. Víðari partial/aggregate/FX og subscription/insurance occurrence matching.
2. Betri template adapter registry og bank feed field mapping.
3. UI-einföldun og umfangsmeiri React/render optimization eftir mælingu.
4. Global product-knowledge governance og hlutlausari context-hugmyndir áður en sharing er stækkað.
5. Stýrð yfirfærsla Float → Decimal/minor-units með samanburðarúttekt á sögulegum gögnum; ákveða contract strax, framkvæma migration vandlega.

### 4. Ekki breyta nema sterk ástæða sé fyrir því

- Ekki slaka á source hash, audit anchor, CAS/freshness eða tenant-bound identity til að leysa eitt erfitt dæmi.
- Ekki breyta `POSSIBLE` í sjálfvirkt confirmed vegna þess að upphæð/dagsetning eða merchant-texti passar.
- Ekki fjarlægja mutual uniqueness/ambiguity til að auka sjálfvirkniprósentu.
- Ekki sameina skjal og skuldbindingu, eða bókun og afstemmingu, í sömu óljósu stöðu.
- Ekki leysa þessar niðurstöður með fleiri Festa/Ergo/Sjóvá/HS/Nova sérreglum í kjarnanum.

## K. Lokaniðurstaða

**Ég myndi halda grunninum en stöðva aukna sjálfvirkni og útvíkkun posting/duplicate/identity á núverandi forsendum þar til tilteknir hlutar hafa verið endurhannaðir. Ég myndi ekki endurskrifa allt GLÖGGT.**

Ástæðan fyrir að halda áfram á grunninum er efnisleg: gagnalíkanið aðskilur skjöl og fjárhagsatburði, ný evidence-vél varðveitir uppruna og audit, afstemmingarkjarninn hefur íhaldssama transaction- og ambiguity-hegðun og almennur company-local lærdómur er til. Þetta eru verðmætir byggingarhlutar.

Ástæðan fyrir tímabundinni stöðvun ákveðinna hluta er líka efnisleg: aðgerð sem bókar getur haft minni heimildavörn en aðgerð sem staðfestir identity; lock getur serializerað tvær rangar ákvarðanir í stað þess að hindra tvíbókun; sama skjal getur haft reviewed draft og annað FinancialEvent-gildi; legacy-regla getur ráðið áður en canonical facts koma til greina. Meiri sjálfvirkni ofan á það myndi stækka skaðamöguleikann.

Næsta þróunarskref ætti því að vera **sameiginleg endanleg bókunar- og heimildavél með almennri identity/discovery-policy**, staðfest með production-líkum test-flæðum. Nýju pure einingarnar ættu að verða fyrirmynd þess verks. Þær eru betri en það end-to-end flæði sem þær eru nú tengdar við.
