# GLÖGGT – vinnudagbók 5. október 2026

**Tímabil:** morgunlota frá um 08:43
**Megináhersla:** Greiðslukort/Visa tengd inn í sama FinancialReconciliation-hugarfar og bankinn, síðan raunpróf og leiðrétting á canonical undirskjalsnotkun.

## Staða við upphaf

Nýtt `docs`, `app`, `lib`, `prisma` og `components` sett var tekið inn. Vinnuskýrsla 4. október staðfesti að næsti rauði þráður var að endurnýta canonical facts og halda einn-smells, deterministic, fail-closed afstemmingu.

## Greiðslukort tengd við fylgiskjalaafstemmingu

Smíðað var nýtt kortasértækt adaptor-lag ofan á sama reconciliation-kjarna:

- `PaymentCardTransaction` helst sjálfstæður sannleiksgjafi, ekki `BankAccount`.
- Candidate-lag ber kortafærslur saman við yfirfarin `AiDetectedDocument`.
- Staðfesting býr til `FinancialReconciliation` af gerð `CARD_TO_REVIEWED_DOCUMENT`.
- Kortafærsla verður `RECONCILED`.
- Audit og fyrirtækjasértækt learning snapshot fylgja.
- Engin Prisma migration þurfti.

Fyrsta staðbundna validation hjá notanda:

- `prisma validate` hreint;
- `prisma generate` hreint;
- `tsc --noEmit` hreint;
- 9/9 markviss provider/confirmation próf græn.

## Fyrsta raunpróf

Kortasíðan sýndi:

- Sterkt mót: 39
- Mögulegt mót: 0
- Fleiri en eitt mót: 7

Bílanaust 38.312 kr. var staðfest með `Afstemma`.

Eftir staðfestingu og refresh:

- Bílanaust hélt stöðunni `Afstemmt`;
- Sterkt mót lækkaði úr 39 í 38;
- persistence frá UI -> reconciliation -> DB -> refresh er því staðfest end-to-end.

## Mikilvæg uppgötvun – Receipt er ekki matching-eining

Við OLIS NJARDVIK FITJAR 2.503 kr. sýndi UI tvö mót sem bæði hétu `Fylgiskjal #308`.

Fyrsta hugmynd var að dedupe-a eftir Receipt, en það væri rangt. Receipt #308 getur innihaldið mörg sjálfstæð, þegar aðskilin `AiDetectedDocument`.

Rétta reglan var því fest:

> **Kortafstemming á að endurnýta þekkinguna úr hverju aðskildu, flokkuðu og yfirförnu undirskjali. Parent Receipt er aðeins gámur.**

V2 breytingin gerir því eftirfarandi:

- matching notar document-local `date`, `merchantName`, `merchantKennitala`, `totalAmount`, `receiptNumber`, flokkun og canonical entity facts;
- `Receipt.date`, `Receipt.aiDate`, `Receipt.merchantName` og `Receipt.merchantKennitala` eru ekki lengur fallback í kortamatching;
- þetta kemur í veg fyrir að facts úr einu sibling undirskjali leki yfir á annað undirskjal í sama PDF;
- `pageNumber`, `documentFingerprint` og `classificationSource` fylgja með sem rekjanleg identity;
- duplicate/disposed undirskjöl eru útilokuð;
- tvö raunverulega sjálfstæð undirskjöl í sama Receipt eru áfram tvíræð ef þau hafa í raun sömu matching-facts;
- UI sýnir nú síðu/documentId, merchant, dagsetningu og upphæð fyrir hvert ambiguous undirskjal í stað þess að sýna bara sama Receipt-númer tvisvar.

## Næsta raunpróf

Eftir yfirlagningu v2 á að skoða sérstaklega:

`OLIS NJARDVIK FITJAR – 01.06.2026 – 2.503 kr.`

Markmiðið er að sjá hvort falska tvíræðnin hverfur þegar parent Receipt fallback er fjarlægt. Ef tvö mót standa enn eftir, þá eiga þau að birtast með ólíkri síðu/documentId svo hægt sé að staðfesta að þau séu raunverulega tvö undirskjöl.

## Arkitektúrregla dagsins

**Gögn fyrst, AI síðan** gildir líka í kortaafstemmingu:

- ekki lesa skjöl aftur;
- ekki endurgiska merchant/date sem þegar hefur verið staðfest;
- nota canonical `AiDetectedDocument` facts;
- Receipt er source container, ekki viðskiptaatburður;
- mannsaugað staðfestir tvíræðni;
- kerfið lærir aðeins af staðfestum pörum.

## Kortaafstemming – dagsetningarforgangur (Olís 2.503 kr.)

Raunpróf sýndi tvö aðskilin og rétt greind Olís-skjöl með sömu upphæð, 2.503 kr.: annað dagsett 01.06.2026 og hitt 29.06.2026. Visa-færslan 01.06.2026 varð ranglega AMBIGUOUS vegna þess að card-reviewed-document graph taldi öll mót innan 30 daga áður en nákvæm dagsetning fékk forgang.

Lagað: exact-date dominance er nú beitt báðum megin í candidate-grafinu áður en mutual uniqueness er reiknað. Ef kortafærsla á exact-date candidate eru non-exact candidates ekki látnir gera það mót tvírætt. Sama regla gildir document-megin. Tvö eða fleiri raunveruleg exact-date mót haldast fail-closed/AMBIGUOUS. 30 daga glugginn helst sem recovery/POSSIBLE leit þegar exact-date mót finnst ekki. Learned pattern má ekki verða STRONG nema dagamunur sé <=3 dagar.

Próf bætt við fyrir rauntilvikið 01.06.2026 vs 29.06.2026 með sömu upphæð og sama merchant, auk varnarprófs þar sem tvö exact-date skjöl haldast ambiguous.

Athugun úr sömu skjáskotum: Receipt.ocrStatus safnar dateWarnings yfir allan margskjala-pakkann og geymir fyrstu þrjár + fjölda annarra. Því getur OCR-lestur vinstra megin sýnt eldri dagsetningar úr öðrum undirskjölum þó valið AiDetectedDocument hafi rétta canonical dagsetningu. Þetta er framsetningar-/scope-atriði í Receipt-stöðu, ekki dagsetningin sem card reconciliation notar.

## FinancialReconciliation – almenn gagnaþekja

Eftir raunpróf á Visa-afstemmingu var tekin almennari arkitektúrniðurstaða: áður en GLÖGGT fer í djúpa candidate-greiningu, skjalaúrvinnslu eða AI á reconciliation að geta sýnt ódýrt deterministic heilsupróf á gagnasafninu sjálfu.

Smíðaður var pure core `lib/financial-reconciliation/coverage.ts` með eftirfarandi contract:

- mode: `REQUIRED | INFORMATIONAL | EXCLUDED`;
- cardinality: `ONE_TO_ONE | ONE_TO_MANY | MANY_TO_ONE | MANY_TO_MANY`;
- state per canonical row: `CONFIRMED | STRONG_UNCONFIRMED | AMBIGUOUS | UNRESOLVED | EXCLUDED | UNKNOWN`;
- fjöldi og algild upphæð eftir gjaldmiðli á source- og target-hlið;
- sýnileg excluded/unknown gögn;
- count ratio aðeins sem completeness-vísir þegar cardinality leyfir;
- exact decimal-samlagning í core, engin fundin 0-gildi þegar upphæð vantar.

Mikilvæg fail-closed regla: coverage má ekki sjálft álykta business/private eða document-required út frá kennitölu, merchant eða korti. Einstaklingsrekstur/blönduð notkun verður því ekki sjálfkrafa að „vantar fylgiskjal“. REQUIRED policy þarf að koma skýrt frá flow/account/card/company samhengi.

Þetta er meðvitað ekki enn tengt Sturlu eða öðrum mixed-use dæmum sem compliance-mælikvarði. V1 er sameiginlegur kjarni án Prisma, migration, UI-texta eða AI. Næsta tenging er flow-specific adapter sem flokkar authoritative rows í coverage-state.

Nýtt tækniskjal: `docs/banki/LESTU-MIG-FINANCIAL-RECONCILIATION-GAGNATHEKJA-20261005.txt`.

## Gagnaþekja tengd við raunflæði – adapter/UI v2

Eftir að pure coverage-core fór 7/7 í prófum var næsta lag tengt við raunveruleg FinancialReconciliation-flæði án þess að færa policy-ákvarðanir inn í core.

Nýtt:

- `lib/financial-reconciliation/coverage-adapters.ts`
  - kortaflæði: `PaymentCardTransaction <-> AiDetectedDocument`;
  - bankaflæði: projection úr authoritative bank diagnostics;
- `app/banki/_components/ReconciliationCoverageOverview.tsx`
  - sameiginlegt coverage-spjald fyrir reconciliation-síður;
- `lib/i18n/reconciliation-coverage.ts`
  - is/en/pl/sr frá byrjun;
- kortasíðan sýnir coverage fyrir allt kortagagnasafnið, ekki aðeins 200 línurnar sem renderast í töflunni;
- bankafstemming sýnir sama sameiginlega spjald áður en dýpri diagnostics koma fyrir.

### Kort – scope-reglur

Korta-adapterinn notar sama candidate graph og staðfest `CARD_TO_REVIEWED_DOCUMENT` reconciliation.

Source:
- confirmed pair -> `CONFIRMED`;
- unique strong -> `STRONG_UNCONFIRMED`;
- ambiguous -> `AMBIGUOUS`;
- possible / ómótuð neikvæð kaupfærsla -> `UNRESOLVED`;
- jákvæð kortafærsla án skýrra document-facts -> `UNKNOWN`, því hún getur verið innborgun/refund/credit og coverage má ekki giska.

Target:
- aðeins reviewed undirskjöl sem eru annaðhvort þegar í candidate/confirmed graph eða hafa canonical `paymentInfo.method = CARD` eru í korta-target safninu;
- skjöl úr öðrum greiðsluaðferðum eru ekki talin sem target-denominator fyrir þetta kort;
- explicit last-four + network má skilgreina `IN_SCOPE`; VISA/network eitt og sér er ekki einstakt kortaauðkenni og helst `UNKNOWN`;
- PRIMARY FinancialEvent / skjöl þegar eignuð öðrum staðfestum reconciliation-flæðum verða `EXCLUDED` fyrir direct card->document coverage.

Þetta endurnýtir því fyrirliggjandi canonical greiðsluaðferð úr þegar lesnum skjölum í stað endurlesturs/AI.

### Banki – ekki falskt 1:1

Bankafstemming getur farið gegn bókunum, FinancialEvents og öðrum flow-kindum. Banka-adapterinn notar því `MANY_TO_MANY`, sýnir source-heilsu (`CONFIRMED`, strong, ambiguous, unresolved o.s.frv.) og einstök target sem diagnostic graph hefur þegar fundið, en notar ekki fjöldajöfnuð sem 1:1 completeness-reglu.

### Policy í þessari útgáfu

UI-tengingin notar `INFORMATIONAL` sjálfgefið. Það er meðvitað: enginn account/card/company coverage-policy er enn persisted. Því verða Sturla/blönduð notkun og önnur óstaðfest samhengi ekki sjálfkrafa að „fylgiskjal vantar“ viðvörun. `REQUIRED` og `EXCLUDED` eru tilbúin í contractinu en eiga síðar að koma úr skýrri stillingu/samhengi, aldrei nafn-/kennitala-hardkóðun.

Markviss behavior-próf fyrir adapterana: 4/4 græn í vinnuumhverfi, auk 7/7 core-prófa frá fyrri áfanga. Fullt project `tsc --noEmit` er áfram keyrt hjá notanda eftir overlay.

## Fyrirtækjaspjald stýrir reconciliation-policy

Eftir raunpróf á Gagnaþekju var ákveðið að coverage-mode eigi að koma frá
staðfestu fyrirtækjasamhengi, sérstaklega vegna einstaklingsreksturs á
persónulegri kennitölu og blandaðrar notkunar.

Ný company-svið:
- `taxIdentityType`: `UNCONFIRMED | LEGAL_ENTITY | INDIVIDUAL`;
- `personalBusinessUse`: `UNCONFIRMED | BUSINESS_ONLY | MIXED_USE`;
- `reconciliationCoverageOverride`: nullable `REQUIRED | INFORMATIONAL | EXCLUDED`.

Pure resolver `lib/financial-reconciliation/company-policy.ts` notar fail-closed
reglur: óstaðfest/legacy samhengi helst `INFORMATIONAL`; lögaðili og staðfest
business-only einstaklingsrekstur verða `REQUIRED`; staðfest `MIXED_USE` verður
`INFORMATIONAL` og gefur contract um að persónulegar færslur megi síðar merkja
rekjanlega sem EXCLUDED. Override vinnur aðeins þegar notandi hefur skráð það
explicit.

Fyrirtækjaspjaldið fær i18n-ready form til að staðfesta samhengi og allar
breytingar fara í `AuditEvent` með action `RECONCILIATION_POLICY_UPDATED`.
Kortafstemming og bankafstemming lesa nú sama resolved company-policy í stað
hardkóðaðs `INFORMATIONAL` mode. Engin kennitala, fyrirtækjanafn eða companyId
er hardkóðað til að greina einstakling/blandaða notkun.

Ný migration:
`20261005111500_add_company_reconciliation_policy`.

Næsta lag eftir þetta er per-transaction flokkun í mixed-use samhengi:
`Persónulegt / ekki rekstur` -> audit + `EXCLUDED`, með síu og afturkræfri
breytingu. Sú aðgerð er meðvitað ekki falin inn í company-policy migrationina.

## Mixed-use tiltekt bankafærslna – source classification v1

Næsta lag ofan á company reconciliation-policy er almennt current-state flokkunarlag fyrir canonical fjármálaheimildir. Fyrsti consumer er `BANK_TRANSACTION`, en gagnalíkanið er generic svo sama lag geti síðar náð yfir `PAYMENT_CARD_TRANSACTION` án þess að bæta flokkunarsviðum beint á frumfærslurnar.

Nýtt model: `FinancialSourceClassification`.

Canonical flokkar í v1:
- `BUSINESS` – staðfest rekstrarfærsla;
- `PERSONAL` – persónulegt / ekki rekstur;
- `INTERNAL_TRANSFER` – innri millifærsla;
- `NON_DOCUMENT` – færslan krefst ekki hefðbundins fylgiskjals;
- `REVIEW` – þarf mannlega yfirferð.

Mikilvægar reglur:
- flokkun breytir aldrei eða eyðir `BankTransaction`;
- current-state flokkun er afturkræf; allar breytingar og afturköllun fara í `AuditEvent`;
- `PERSONAL` er aðeins heimilt þegar staðfest company-policy leyfir mixed-use personal exclusion;
- færslu með staðfesta reconciliation-tengingu má ekki færa út úr document-workflow eftir á;
- merchant/counterparty texti einn og sér má aldrei búa til `PERSONAL` sannleika;
- deterministic suggestion má aðeins benda á `NON_DOCUMENT` þegar fyrirliggjandi flow-kind classifier hefur explicit bankagögn, t.d. bankagjald, vexti, reversal eða kreditkortauppgjör;
- generic `Millifærsla` er ekki sjálfkrafa `INTERNAL_TRANSFER`; eigin-reikningssönnun þarf síðar.

Mixed-use bankafstemming fær síur:
- Í afstemmingu;
- Allt;
- Persónulegt;
- Utan fylgiskjalaþekju;
- Óflokkað / þarf yfirferð.

Persónulegar færslur fara út úr almennri business coverage-denominator. `INTERNAL_TRANSFER` og `NON_DOCUMENT` eru hins vegar ekki taldar „persónulegar“ í almennri FinancialReconciliation coverage; þær merkja að annað reconciliation-flow eða önnur gagnategund eigi við. Í document-worklist eru þær þó síanlegar út svo fylgiskjalagreiningin mengist ekki.

Ný migration: `20261005120500_add_financial_source_classification`.

Viðbót við mixed-use tiltekt: staðfest history má mynda read-only tillögu á nákvæmlega sama normaliseraða bankatexta eftir að minnsta kosti tvær samhljóða staðfestingar (`PERSONAL` eða `BUSINESS`). Ein mótsagnakennd staðfest flokkun lokar tillögunni. Þetta er ekki sjálfvirk merchant-regla og ekkert er flokkað án nýrrar notendastaðfestingar.

## Mixed-use tiltekt greiðslukorta – sama source classification lag

`FinancialSourceClassification` er nú einnig tengt við `PAYMENT_CARD_TRANSACTION`.
Kort og banki nota því sama canonical current-state flokkunarlagið í stað tveggja
sérkerfa.

Á greiðslukortum eru sömu flokkar tiltækir:
- `BUSINESS` – rekstur;
- `PERSONAL` – persónulegt / ekki rekstur;
- `INTERNAL_TRANSFER` – innri millifærsla;
- `NON_DOCUMENT` – ekki hefðbundin fylgiskjalafærsla;
- `REVIEW` – þarf yfirferð.

Öryggisreglur:
- `PERSONAL` er aðeins heimilt þegar resolved company-policy staðfestir mixed-use;
- staðfest `CARD_TO_REVIEWED_DOCUMENT` afstemming má ekki síðar vera flokkuð út úr
  document-workflow;
- flokkun breytir ekki `PaymentCardTransaction`, heldur býr/uppfærir auditable
  `FinancialSourceClassification` record;
- flokkun er afturkræf og clear-aðgerð skrifar audit;
- engin merchant-regla er sjálfkrafa staðfest sem persónuleg í þessum áfanga.

Korta-candidate graph sleppir nú `PERSONAL`, `INTERNAL_TRANSFER` og
`NON_DOCUMENT` færslum áður en fylgiskjalaleit fer fram. Sama flokkun fer inn í
card coverage-adapter, þannig að þessar færslur verða `EXCLUDED` úr
fylgiskjalaþekju en haldast sýnilegar í `Allt` / viðeigandi síum.

Kortasíðan fær síur:
- Í afstemmingu;
- Allt;
- Persónulegt;
- Utan fylgiskjalaþekju;
- Óflokkað / þarf yfirferð.

Markmiðið er að mixed-use kort eins og hjá einstaklingsrekstri geti hreinsað
persónulegar færslur úr rekstrarafstemmingu án þess að eyða eða fela frumgögnin.

## Sameiginlegt reviewed-document read/diagnostic lag fyrir banka og kort

Bankafstemming og greiðslukortaafstemming deila nú sama canonical read-lagi fyrir
`AiDetectedDocument` í stað þess að hvort svæði lesi skjölin á sinn hátt.

Meginreglur:
- `AiDetectedDocument` er canonical matching-eining; `Receipt` er gámur/navigation;
- merchant/date úr parent `Receipt` má aðeins vera legacy fallback þegar gámurinn
  inniheldur nákvæmlega eitt detected document. Multi-document PDF má aldrei leka
  merchant/date facts á milli systurskjala;
- duplicate/disposed skjöl eru tekin út áður en bæði banki og kort byggja candidate graph;
- staðfest reconciliation-eign á `AI_DETECTED_DOCUMENT` lokar skjalinu fyrir nýju
  candidate-móti á báðum svæðum;
- `ORGANIZATION` + `ISSUER` entity-tengingar mynda fyrirtækjasértækt canonical
  alias-sett. Ef sama kennitala/entity hefur áður birst sem bæði vörumerki og
  lögaðili má reconciliation nota bæði nöfn sem read-only identity evidence;
- alias er aðeins byggt úr sama fyrirtækjaumhverfi og staðfestu entity-graphi;
  merchant-heiti eitt og sér sameinar ekki entities og ekkert verður auto-confirmed.

Kortin fá jafnframt sama rejection-diagnostic hugsunarhátt og bankinn:
- ekkert skjal með sömu absolute upphæð;
- sama upphæð en dagsetning utan glugga;
- skjal til en það er í öðru/óhæfu flæði (t.d. PRIMARY FinancialEvent eða þegar
  eignað öðru staðfestu reconciliation-móti);
- upphæð og dagsetning passa en canonical mótaðili/alias leysist ekki.

Diagnostic-lagið er read-only og breytir hvorki classification né reconciliation.
Það á að gera „Engin örugg tillaga“ útskýranlega og hjálpa að finna kerfisbundin
identity-/skjalagöt áður en AI eða handvirk yfirferð er notuð.

## Kortafstemming – exact date + amount search-first úr raunlistum

Raungögn úr Skjalasafni og Gullkorti sýndu að kortatexti og skjalaseljanandi geta
verið mismunandi þó upphæð og kaupdagur passi nákvæmlega, t.d. KFC staðarheiti og
OB/Olís. Matching má því ekki byrja á merchant-stringi einum.

Ný deterministic röð:
1. byggja exact lookup key úr `currency + UTC dagsetningu + absolute minor-unit upphæð`;
2. leita fyrst að hæfum yfirförnum undirskjölum með sama key;
3. canonical merchant/alias staðfestir STRONG þar sem hann leysist;
4. ef aðeins eitt hæft undirskjal hefur nákvæmlega sömu dagsetningu og upphæð en
   identity leysist ekki, birtist það sem `UNIQUE_POSSIBLE` með skýringunni að
   mótaðili þurfi staðfestingu;
5. fleiri en eitt exact amount/date skjal helst `AMBIGUOUS`/fail-closed;
6. aðeins ef ekkert exact amount/date candidate finnst er farið í breiðari <=30 daga
   identity/learning leit.

Notendastaðfest possible-mót halda áfram að fæða fyrirtækjasértæka
`reviewed-document-learning`, þannig að alias/mynstur geta styrkst með endurteknum
staðfestingum án hardkóðunar á Pítan/KFC/OB/Olís.

Gamall mótreikningur í bókun (t.d. 1510 áður en kortayfirlit barst, síðar 2230)
er ekki hluti af candidate evidence og má ekki loka kortaafstemmingu. Ef skjal er
hins vegar canonical PRIMARY fyrir FinancialEvent heldur event-flæðið eignarhaldi;
bein card->document afstemming fer ekki framhjá því.
