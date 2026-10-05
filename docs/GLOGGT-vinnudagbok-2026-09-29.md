# GLÖGGT – vinnudagbók 29. september 2026

**Dagsetning:** þriðjudagur 29. september 2026  
**Dagslok:** um kl. 22:30  
**Meginþemu dagsins:** nýtt samstarf ChatGPT + Astra + Codex, almenn fjármálaafstemming, tenging bankareiknings við bókhaldslykil, deterministic candidate-vél, FinancialEvent-materialization og backfill, banki↔FinancialEvent kandidatlag, örugg notandastaðfesting og production-checkpoint.

---

## 1. Yfirlit dagsins

29. september varð einn stærsti arkitektúrdagurinn hingað til í fjármálaafstemmingum GLÖGGT.

Dagurinn byrjaði á að skýra og prófa nýtt verkfærasamstarf í þróunarvinnunni. ChatGPT heldur áfram að stýra arkitektúr, samhengi, áhættum og checkpointum. Codex var prófað sem afmarkað framkvæmda-/kóðunarverkfæri í einangruðu umhverfi. Auk þess var hlutverk **GPT-6 Astra** skilgreint sem sjálfstæð aðstoðarvél/arkitektarýnir sem ChatGPT getur notað til að fá annað sjónarhorn á stærri hönnunarákvarðanir áður en þær eru festar í kóða.

Meginvinna dagsins var síðan fjármálaafstemmingin sem var mótuð 28. september. Sú hönnun fór í dag úr almennri hugmynd yfir í raunveruleg production-lög:

- canonical `FinancialReconciliation` lag;
- deterministic banki↔bókun candidate-vél;
- explicit tenging BankAccount við bókhaldslykil;
- sameiginleg reconciliation þjónusta;
- víðari deterministic match-reglur án auto-giska;
- almennt `FinancialEvent` lag fyrir yfirfarin bókhaldsskjöl;
- backfill á eldri yfirfarin skjöl;
- banki↔FinancialEvent evidence/candidate lag;
- og loks notandastýrður staðfestingarkjarni fyrir `BANK_TO_FINANCIAL_EVENT`.

Dagurinn endaði á mjög hreinum checkpoint:

- nýjasti commit: `b42dd7c` – **Bæta við staðfestingu á bankagreiðslu móti FinancialEvent**;
- `main` og `origin/main` samstillt;
- Vercel Production: **Ready**;
- 28/28 relevant staðfestingarpróf stóðust;
- TypeScript og `git diff --check` hrein;
- engin schema/UI-breyting í síðasta staðfestingarlagi;
- ein óvenjuleg, eldri untracked scratch-skrá er enn ósnert;
- production-preflight á bankafærslu #275 ↔ FinancialEvent #2 var hreint;
- **raunstaðfestingin var viljandi ekki framkvæmd í kvöld**.

---

# 2. Nýtt þróunarvinnulag: ChatGPT, Astra og Codex

## 2.1 ChatGPT – arkitektúr, samhengi og stjórn vinnulotunnar

ChatGPT heldur utan um heildarsamhengi GLÖGGT:

- hvaða lög eru canonical sannleikur;
- hvaða eldri virkni má ekki brjóta;
- hvaða breytingar eru öruggar í production;
- hvaða gögn þarf að skoða áður en kóði er skrifaður;
- hvernig breytingum er skipt í litla checkpointa;
- og hvenær á að stoppa, prófa, commit-a og push-a.

Í dag var þetta sérstaklega mikilvægt þegar reconciliation-vinnan færðist úr candidate-leit yfir í raunveruleg payment/reconciliation writes. Markmiðið var allan tímann að láta **gögn og staðfest evidence stjórna**, en ekki láta kóðann draga ályktanir sem gögnin styðja ekki.

## 2.2 GPT-6 Astra – sjálfstæð aðstoðarvél / arkitektarýnir

Í dag var einnig skýrt hvernig ChatGPT nýtir **GPT-6 Astra** sem aðstoðarvél í GLÖGGT-vinnunni.

Astra er ekki látin „keyra verkefnið“ eða skrifa beint í production. Hlutverk hennar er að vera **sjálfstæður arkitektarýnir** þegar stærri ákvörðun þarf annað sjónarhorn.

Vinnulagið er:

1. ChatGPT tekur saman hreint og afmarkað samhengi úr GLÖGGT – skjöl, reglur, gagnalíkön og vandamálið sem þarf að leysa.
2. Astra fær þetta samhengi án þess að vera mötuð á fyrirfram ákveðna niðurstöðu.
3. Hún er beðin um að gagnrýna hönnun, finna veikleika, alternative leiðir og áhættu.
4. ChatGPT ber þá rýni saman við raunverulegt repo, gögn og þær reglur sem þegar hafa verið samþykktar.
5. Benedikt og ChatGPT ákveða síðan hvað á í raun að fara inn í GLÖGGT.

Þannig er Astra notuð sem **annað óháð tæknilegt sjónarhorn**, ekki sem source of truth og ekki sem sjálfvirkur ákvarðanataki.

## 2.3 Codex – framkvæmda- og kóðunarverkfæri

Codex var prófað fyrst í einangruðu `C:\CODEX-PRUFA` umhverfi.

Prófið tókst:

- 3 skrár voru búnar til;
- deterministic formatting-fix breytti aðeins `script.js`;
- 50 Node.js assertions stóðust;
- Chrome sýndi rétt `21.09.2026` og `58.670 kr.`;
- síur gáfu 11.740, 31.180 og 15.750 kr.;
- ekkert óviðkomandi utanumhverfi var snert.

Eftir það var Codex notað sem sérhæfður „verkmaður“ á afmörkuðum verkefnum: lesa tilteknar skrár, skrifa kóða, bæta prófum og keyra validation. ChatGPT hélt áfram að yfirfara breytingarnar og samþykkja næsta skref áður en stage/commit/push fór fram.

Þessi verkaskipting virkaði vel í dag:

**ChatGPT = arkitekt / verkstjóri / samhengisvörður.  
Astra = sjálfstæður arkitektarýnir.  
Codex = afmarkað framkvæmda- og kóðunarverkfæri.**

---

# 3. Almenn fjármálaafstemming – frá hönnun yfir í kjarna

Vinnan frá 28. september var tekin áfram með þeirri grundvallarreglu að GLÖGGT eigi ekki að búa til sértæka match-töflu fyrir hvert fjármálatilfelli.

Canonical lagið byggist á:

### `FinancialReconciliation`

Varanleg afstemming með meðal annars:

- company;
- reconciliation type;
- status;
- confidence;
- source;
- confirmedBy / confirmedAt;
- metadata og audit timestamps.

### `FinancialReconciliationParticipant`

Þátttakandi í reconciliation:

- `sourceType`;
- `sourceKey`;
- `role`;
- jákvætt `matchedAmount`;
- metadata.

Canonical reconciliation types sem unnið var með eru meðal annars:

- `BANK_TO_BOOKING`;
- `BANK_TO_FINANCIAL_EVENT`;
- `CARD_TO_BOOKING`.

Participant-gerðir/hlutverk meðal annars:

- `BANK_TRANSACTION` / `MONEY_MOVEMENT`;
- `RECEIPT_ENTRY` / `BOOKING`;
- `FINANCIAL_EVENT` / `OBLIGATION`.

Candidate-leit þarf ekki sjálfkrafa að skrifa reconciliation. Varanlegt record verður til þegar tillaga er sérstaklega varðveitt eða samsvörun hefur verið staðfest.

---

# 4. Bankareikningur tengdur við réttan bókhaldslykil

Ein mikilvæg grunnbreyting var að láta bankareikning bera explicit tengingu við bókhaldslykil í stað þess að giska út frá númerum eða texta.

Fyrir fyrirtæki #8 var staðfest:

- BankAccount #2 – Íslandsbanki;
- fyrirtæki #8;
- tengdur við Account #111;
- account number `1510`;
- heiti `Banki`;
- type `BANK`;
- entryRole `PAYMENT`.

Tengingin var gerð sem gagnatenging, ekki hardcode í reconciliation-vélinni.

Source-loaderinn varð síðan fail-closed:

- `BANK_ACCOUNT_NOT_FOUND`;
- `LEDGER_ACCOUNT_NOT_LINKED`;
- `LEDGER_ACCOUNT_COMPANY_MISMATCH`.

Þetta varð grunnur að sameiginlegri `getBankBookingReconciliation(bankAccountId, companyId)` þjónustu.

---

# 5. Deterministic banki↔bókun candidate-vél

Fyrsta candidate-lagið notaði þröng evidence-mynstur:

- `EXACT_DATE_AMOUNT_PARTY` → STRONG;
- `EXACT_DATE_AMOUNT` → POSSIBLE;
- `NEAR_DATE_AMOUNT_PARTY` innan 3 daga → POSSIBLE.

Síðar í dag var lagið víkkað varfærnislega:

- `EXTENDED_DATE_AMOUNT_PARTY` – 4–30 dagar + mótaðili;
- `NO_DATE_AMOUNT_PARTY` – bókun vantar dagsetningu en party passar.

Strong-reglan var **ekki** víkkuð.

Eftir víkkunina var staðan:

- 331 bankafærslur;
- 1 `uniqueStrong`;
- 0 `ambiguousStrong`;
- 7 `possible`;
- 323 `none`.

Dæmi sem komu fram:

- Bank #329 Sjóvá -901 ↔ ReceiptEntry #553 – exact date/amount;
- Bank #325 Ergo -75.412 ↔ #561 – near date party, 2 dagar;
- Bank #326 Ergo -46.147 ↔ #557 – near date party, 2 dagar;
- Bank #303 Lífeyrissjóður +7.291 ↔ #550 – no date party;
- Bank #305 Greiðslustofa lífeyrissjóða +324.243 ↔ #584 – `UNIQUE_STRONG`;
- Bank #274 Heilbrigðisstofnun Suðurnesja -500 ↔ #571 – extended, 18 dagar;
- Bank #277 HS Veitur -62.817 ↔ #591 – extended, 9 dagar;
- Bank #261 Lífeyrissjóður +7.374 ↔ #593 – extended, 26 dagar.

Mikilvæg regla hélst allan daginn:

> **POSSIBLE er evidence fyrir mannlega yfirferð, ekki heimild til auto-confirm.**

---

# 6. FinancialEvent – almenn skuldbinding / fjármálaviðburður úr yfirförnum skjölum

Næsta stóra spurning var hvernig bankafærsla ætti að geta tengst raunverulegri skuldbindingu þegar ReceiptEntry er ekki rétta abstraction-lagið.

Niðurstaðan var að nýta `FinancialEvent` sem canonical fjármálaviðburð.

Fyrir yfirfarin bókhaldsskjöl var mótað deterministic materialization-lag:

- `ACCOUNTING_DOCUMENT` með nákvæmlega einu `INVOICE` entity → `CHARGE`;
- `CREDIT_NOTE` → `CREDIT`;
- `CHARGE` amount = `+abs(totalAmount)`;
- `CREDIT` amount = `-abs(totalAmount)`;
- ef payment schedule er til, heldur gamla schedule-flow forgangi;
- aðeins `BOOKABLE` skjöl;
- manual classification er ekki sjálfvirkt materialized;
- canonical counterparty tenging aðeins þegar nákvæmlega eitt ORGANIZATION entity er til;
- engin regex-giskun úr bókunartexta.

`FinancialEvent.status = OPEN` var sérstaklega staðfest sem **lifecycle status**, ekki einfalt greitt/ógreitt flagg.

---

# 7. Skatturinn pilot – canonical entity í stað texta-alias

Skatturinn/Ríkissjóðsinnheimtur varð mikilvægt testcase.

Við vildum ekki búa til handgerðan texta-alias eins og „Ríkissjóðsinnheimtur = Skatturinn“ án rekjanlegs gagnagrunns.

Canonical entity evidence sýndi:

- Skatturinn organization entity #45;
- kennitala `540269-6029`;
- Receipt #164 / document #338 tengdist entity #45 og invoice ref `BM102941605`;
- Receipt #190 / document #339 tengdist entity #45 og credit invoice ref `BM-CN-1078697882`.

Pilot-materialization bjó til:

### FinancialEvent #2

- Receipt #164 / document #338;
- `CHARGE`;
- amount **36.027 kr.**;
- externalReference `BM102941605`;
- counterparty entity #45;
- liabilityAccountId = null.

### FinancialEvent #3

- Receipt #190 / document #339;
- `CREDIT`;
- amount **-11.427 kr.**;
- externalReference `BM-CN-1078697882`;
- counterparty entity #45;
- liabilityAccountId = null.

Bankagögnin sýndu síðan:

- Event #2 ↔ BankTransaction #275, `Ríkissjóðsinnheimtur`, -36.027 kr., 11 daga bil;
- Event #3 ↔ BankTransaction #292, `Ríkissjóður Íslands`, +11.427 kr., 3 daga bil.

Bankareferences pössuðu **ekki** við document externalReference. Því var ekki búinn til falskur reference-match eða alias.

---

# 8. Backfill á FinancialEvent

Dry-run yfir fyrirtæki #8 sýndi:

- 116 reviewed documents;
- upphaflega 1 PRIMARY event;
- 33 eligible samtals;
- 2 pilot skjöl voru tekin fyrst;
- eftir pilot voru 31 eligible eftir;
- 24 CHARGE;
- 7 CREDIT;
- 26 með canonical counterparty;
- 5 án counterparty.

Fyrsta fulla backfill-tilraun á öllum 31 inni í transaction lenti í Prisma `P2028` timeout við um 5 sekúndur.

Mikilvæg staðfesting:

- nýtt dry-run sýndi enn 31 eligible;
- því hafði transaction rollback tekist fullkomlega;
- engin hálfskrifuð gögn urðu eftir.

Transaction var síðan keyrð með hærra timeout (`maxWait: 10000`, `timeout: 60000`).

Niðurstaða:

- `createdExpected: 31`;
- `eligibleRemaining: 0`;
- `primaryLinksForCompany: 34`.

Þannig eru nú 34 PRIMARY FinancialEvent links hjá fyrirtæki #8:

- gamla Vogar-eventið;
- 2 pilot events;
- 31 backfill events.

---

# 9. BANK_TO_FINANCIAL_EVENT candidate-lag

Nýja lagið í `event-candidates.ts` er viljandi evidence-only.

Reglur:

- event og bankafærsla verða að vera sama company;
- ISK;
- eventType CHARGE eða CREDIT;
- exact opposite amount;
- CHARGE er jákvætt event á móti neikvæðri bankafærslu;
- CREDIT er neikvætt event á móti jákvæðri bankafærslu;
- mest 30 dagar;
- 0–3 dagar → `EXACT_EVENT_AMOUNT_NEAR_DATE`;
- 4–30 dagar → `EXACT_EVENT_AMOUNT_EXTENDED_DATE`;
- exact normalized reference getur bætt `EXACT_EVENT_REFERENCE` evidence við, en reference má **aldrei** bypass-a amount/date reglurnar;
- styrkur er áfram `POSSIBLE`.

Decimal samanburður er gerður sem exact minor-units parsing, ekki laus floating-point Number samanburður.

Eftir fulla backfillið gaf þjónustan:

- **21 candidate-pör**;
- á **20 bankafærslum**;
- 19 bankafærslur með einum candidate;
- ein bankafærsla tvíræð.

Tvíræða dæmið er:

### BankTransaction #7 – -49.939 kr.

Passar við tvö FinancialEvents:

- Event #44 – 11 dagar;
- Event #42 – 19 dagar.

Bæði eru `POSSIBLE`.

GLÖGGT má ekki velja sjálft á milli þeirra.

Pilot-pörin héldust:

- Bank #275 ↔ Event #2 – 36.027 / -36.027, 11 dagar, extended;
- Bank #292 ↔ Event #3 – -11.427 / +11.427, 3 dagar, near.

---

# 10. Staðfestingarkjarni fyrir BANK_TO_FINANCIAL_EVENT

Lokastóra verkefni dagsins var að fara frá candidate evidence yfir í **notandastýrða staðfestingu**.

Nýtt:

- `lib/financial-reconciliation/event-confirmation.ts`
- `lib/financial-reconciliation/event-confirmation.test.ts`

Kjarninn:

1. tekur aðeins explicit IDs frá kallanda;
2. endurles BankTransaction og FinancialEvent inni í transaction;
3. staðfestir sama company;
4. endurreiknar candidate deterministic – gömul UI-candidate gögn eru ekki trusted;
5. keyrir í `SERIALIZABLE` transaction;
6. býr til/stendur við `FinancialEventPayment`;
7. býr til canonical `FinancialReconciliation` með tveimur participants;
8. skráir `AuditEvent`;
9. markar BankTransaction `RECONCILED` aðeins þegar confirmed payment-summa nær nákvæmlega bankafjárhæðinni;
10. breytir **ekki** `FinancialEvent.status`;
11. býr **ekki** til `FinancialEventPaymentAllocation` fyrir venjulegt CHARGE/CREDIT.

Þetta er meðvitað systurflæði við schedule/payment-allocation kerfið. Schedule item þarf aðeins þegar greiðslu er úthlutað á tiltekinn gjalddaga.

Schemað styður beinlínis FinancialEventPayment án allocation.

---

# 11. Safety-hardening áður en commit var leyft

Við stoppuðum áður en stage/commit fór fram vegna mikilvægrar hættu:

Bankafærsla gæti þegar verið `RECONCILED` í öðru flæði, án þess að `FinancialEventPayment` væri til.

Þá hefði nýja fallið getað endurnýtt sömu peningahreyfingu aftur.

Vörnin sem var bætt við:

- ef `BankTransaction.status === RECONCILED`, er aðeins leyft að halda áfram ef nákvæmlega sama event+bank par á þegar `CONFIRMED` payment;
- annars `BANK_TRANSACTION_ALREADY_RECONCILED`;
- leitað er einnig að öllum öðrum `CONFIRMED FinancialReconciliation` sem nota sömu bankafærslu sem `MONEY_MOVEMENT`;
- önnur reconciliation blokkar staðfestinguna, jafnvel ef bank status er stale;
- sama-par idempotency er áfram leyfð;
- legacy tilfelli þar sem CONFIRMED payment er til en canonical reconciliation vantar má klára án duplicate payment;
- `REJECTED`/`VOID` payment eða reconciliation eru ekki endurvakin sjálfkrafa.

Eftir hardening:

- **28/28 próf stóðust**;
- `npx tsc --noEmit` hreint;
- `git diff --check` hreint.

Prófin ná meðal annars yfir:

- CHARGE;
- CREDIT;
- cross-company fail-closed;
- rangt sign;
- >30 daga bil;
- breytt amount eftir candidate;
- idempotent retry;
- over-allocation;
- ambiguity með explicit vali;
- serialization conflict/retry;
- malformed/duplicate reconciliation;
- þegar RECONCILED bankafærsla má ekki vera tekin aftur;
- þegar annað CONFIRMED reconciliation á bankafærslunni blokkar;
- legacy completion án duplicate payment.

---

# 12. Commit og production checkpoint

Aðeins tvær nýju confirmation-skrárnar voru staged.

Scratch-skráin:

`"cratchreviewed-document-type-scan.ts\357\200\242"`

var fyrir, er óvenjuleg/untracked og var **ekki** snert, staged eða eytt.

Commit:

`b42dd7c` – **Bæta við staðfestingu á bankagreiðslu móti FinancialEvent**

Tölur:

- 2 files changed;
- 447 insertions;
- nýjar skrár:
  - `event-confirmation.ts`;
  - `event-confirmation.test.ts`.

Fyrir push:

- `main...origin/main [ahead 1]`;
- aðeins `b42dd7c` í `origin/main..HEAD`;
- `git diff --check origin/main..HEAD` hreint.

Push:

`f9e231f..b42dd7c  main -> main`

Eftir push:

- `## main...origin/main`;
- aðeins scratch-skráin untracked.

Vercel:

- commit `b42dd7c`;
- Environment: **Production**;
- Status: **Ready**.

---

# 13. Read-only production preflight – Bank #275 ↔ Event #2

Áður en fyrsta raunstaðfestingin yrði gerð var production lesið read-only.

Niðurstaða:

### BankTransaction #275

- companyId: 8;
- amount: `-36027`;
- date: 09.02.2026;
- text: `Ríkissjóðsinnheimtur`;
- reference: `010226`;
- status: `UNRECONCILED`.

### FinancialEvent #2

- companyId: 8;
- type: `CHARGE`;
- status: `OPEN`;
- amount: `36027`;
- eventDate: 29.01.2026;
- currency: `ISK`;
- externalReference: `BM102941605`.

### Fyrirliggjandi staðfestingar

- `existingPayment = null`;
- engin `CONFIRMED FinancialReconciliation` notar bankafærslu #275.

### Candidate

- exact opposite amount;
- 11 dagar;
- reason `EXACT_EVENT_AMOUNT_EXTENDED_DATE`;
- evidence `[]`;
- strength `POSSIBLE`.

Preflightið skrifaði engin gögn.

---

# 14. Heimildalag staðfest fyrir morgundaginn

Við vildum **ekki** keyra production confirmation úr scratch-scripti með handvöldu `userId`.

Þess í stað var raunveruleg authorization-leið skoðuð.

`bankContext()`:

- les `sessionToken` úr cookie;
- les/tekur companyId;
- staðfestir virka session;
- staðfestir virkan notanda;
- fyrir non-ADMIN staðfestir virkt UserCompany aðgengi;
- skilar `{ companyId, userId }`.

`getCompanyAccess(companyId)`:

- ADMIN fær allar heimildir;
- annars er UserCompany frumheimildin;
- `canReconcileBookkeeping` er sérstök afstemmingarheimild.

Rétta næsta server-action flæði er því:

`bankContext(companyId)`  
→ `getCompanyAccess(companyId)`  
→ krefjast `allowed && canReconcileBookkeeping`  
→ `confirmBankFinancialEventPayment(...)`.

Þannig fær AuditEvent raunverulegan innskráðan notanda og production confirmation fer ekki fram með tilbúnu ID.

---

# 15. Commits / checkpoints í reconciliation-lotunni

Mikilvægir commit-punktar sem mynduðu stöðuna í dag:

- `19b3a01` – Skrá fjármálaafstemmingarstöðu 28. september
- `393139b` – Bæta við almennu fjármálaafstemmingarlagi
- `d59091d` – Bæta við deterministic afstemmingarkandídötum
- `5d6b93b` – Tengja bankareikning við bókhaldslykil
- `93dd319` – Bæta við source-loader fyrir bankafstemmingu
- `2780114` – Sameina almenna bankafstemmingarþjónustu
- `e7337d0` – Herða fyrirtækjamörk í bankafstemmingu
- `de1cce6` – Undirbúa fjöltyngda bankafstemmingu
- `8095626` – Tengja Afstemming við almenna reconciliation þjónustu
- `080a2b5` – Bæta við víðari afstemmingartillögum
- `833ba7d` – Bæta við almennu FinancialEvent lagi fyrir yfirfarin skjöl
- `f9e231f` – Bæta við bankakandídötum fyrir FinancialEvent
- `b42dd7c` – Bæta við staðfestingu á bankagreiðslu móti FinancialEvent

`833ba7d`, `f9e231f` og `b42dd7c` voru öll staðfest sem production checkpoints í vinnulotunni; nýjasti loka-checkpoint er `b42dd7c`.

---

# 16. Hvað er EKKI gert enn

Mikilvægt fyrir næstu lotu:

- BankTransaction #275 ↔ FinancialEvent #2 hefur **ekki** verið raunstaðfest.
- Enginn `FinancialEventPayment` hefur verið skrifaður fyrir það par enn.
- Engin `BANK_TO_FINANCIAL_EVENT` reconciliation hefur verið skrifuð fyrir það par enn.
- Enginn AuditEvent fyrir raunstaðfestinguna er til enn.
- Enginn UI-hnappur fyrir þessa nýju staðfestingu er tengdur enn.
- `FinancialEvent.status` á ekki að verða greitt/ógreitt flagg.
- Ekki má auto-confirm-a POSSIBLE candidates.
- Bank #7 er enn tvíræður og verður að krefjast explicit mannlegs vals.
- Ekki búa til texta-alias „Ríkissjóðsinnheimtur = Skatturinn“ án canonical evidence.
- Ekki endurnýta schedule allocation flow fyrir venjulegt CHARGE/CREDIT.
- Ekki snerta óvenjulegu untracked scratch-skrána fyrr en hún hefur verið rannsökuð sérstaklega.

---

# 17. Fyrsta verk næstu lotu

1. Bæta litlu permanent server action við `app/banki/actions.ts`.
2. Nota `bankContext(companyId)` til að fá raunverulegt `userId`.
3. Kalla `getCompanyAccess(companyId)` og krefjast `canReconcileBookkeeping`.
4. Kalla síðan `confirmBankFinancialEventPayment` fyrir explicit valið par.
5. Nota Bank #275 ↔ Event #2 sem fyrsta stýrða production-smoke-test.
6. Eftir staðfestingu lesa aftur og sannreyna:
   - eitt CONFIRMED `FinancialEventPayment`;
   - eitt CONFIRMED `BANK_TO_FINANCIAL_EVENT` reconciliation;
   - nákvæmlega tvo canonical participants;
   - AuditEvent með réttum innskráðum notanda;
   - `BankTransaction #275.status = RECONCILED`;
   - `FinancialEvent #2.status` óbreytt `OPEN`;
   - engin `FinancialEventPaymentAllocation`.
7. Prófa idempotent second call.
8. Aðeins þegar þetta er staðfest, tengja candidate-sýnina við UI í litlum skrefum.
9. Bank #7 verður sérstakt ambiguity testcase þar sem notandi verður að velja Event #42 eða #44 sjálfur.

---

# 18. Dagsniðurstaða

29. september færði GLÖGGT úr „við getum fundið líkleg tengsl“ yfir í **rekjanlegan, canonical og öruggan staðfestingarkjarna**.

Meginniðurstaðan er ekki bara að bankafærsla geti tengst FinancialEvent. Mikilvægara er hvernig það er gert:

- candidate evidence er aðskilið frá staðfestum sannleika;
- deterministic reglur eru endurreiknaðar við staðfestingu;
- user authorization er sérstakt lag;
- greiðsla, reconciliation og audit eru rekjanleg;
- over-allocation og tvöföld notkun sömu bankafærslu fail-ar closed;
- ambiguous tilfelli eru látin bíða eftir manni;
- FinancialEvent lifecycle og payment state eru ekki rugluð saman;
- og engin AI-giskun var nauðsynleg í þessum reconciliation-kjarna.

Þetta er nákvæmlega í anda GLÖGGT-reglunnar:

> **Gögn fyrst. Deterministic evidence næst. Mannleg staðfesting þar sem þarf. AI aðeins þar sem raunverulegt túlkunargat er eftir.**

**Loka-checkpoint dagsins: `b42dd7c` – Ready / Production.**  
**Næsti upphafspunktur: authorization-wrapped server action → ein stýrð live staðfesting á #275 ↔ #2 → síðan UI.**
