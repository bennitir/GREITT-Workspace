# GLÃ–GGT â€“ Ã³hÃ¡Ã° heildarÃºttekt Ã¡ bÃ³khaldskerfi og kjarna

**Dagsetning:** 6. oktÃ³ber 2026<br>
**Grunnur:** snapshot sem notandi afhenti 6. oktÃ³ber (`app`, `components`, `lib`, `prisma`, `docs`, `scripts`, `public` og rÃ³tarstillingar).<br>
**Astra-skÃ½rsla:** ekki lesin eÃ°a notuÃ° viÃ° Ã¾essa niÃ°urstÃ¶Ã°u.

## AÃ°ferÃ° og takmÃ¶rk

Ãžetta er sjÃ¡lfstÃ¦Ã° kÃ³Ã°a- og arkitektÃºrÃºttekt. Ã‰g fÃ³r yfir raunverulegan kÃ³Ã°a, Prisma-lÃ­kan, aÃ°gangsstÃ½ringu, bÃ³kunarflÃ¦Ã°i, duplicate/document-instance lag, banka- og kortaafstemmingu, canonical entity/learning lÃ¶g, VSK, prÃ³faskipan og helstu query-flÃ¦Ã°i. SkjÃ¶l voru notuÃ° sem samhengi en kÃ³Ã°i lÃ¡tinn rÃ¡Ã°a ef Ã³samrÃ¦mi var.

Ã‰g aÃ°greini niÃ°urstÃ¶Ã°ur svona:

- **STAÃFEST:** sÃ©st beint Ã­ kÃ³Ã°a/gagnalÃ­kani.
- **STERK ÃLYKTUN:** kÃ³Ã°inn sÃ½nir mjÃ¶g lÃ­kleg Ã¡hrif, en raunmÃ¦ling eÃ°a production-gÃ¶gn myndu staÃ°festa stÃ¦rÃ° Ã¾eirra.
- **ÃžARF MÃ†LINGU:** ekki rÃ©tt aÃ° fullyrÃ°a um raunhraÃ°a Ã¡n profiling/DB EXPLAIN/production timings.

Ã‰g keyrÃ°i **ekki** heildarprÃ³fasafniÃ°. SnapshotiÃ° inniheldur ekki `node_modules`, `package.json` skilgreinir ekki `test` script og Ã¾vÃ­ er skÃ½rslan ekki byggÃ° Ã¡ Ã¾vÃ­ aÃ° Ã©g hafi sjÃ¡lfur endurkeyrt grÃ¦nu prÃ³fin. Ã‰g taldi 41 test-skrÃ¡ og las mikilvÃ¦ga test-/production-kÃ³Ã°aleiÃ°ir. Performance-mat er Ã¾vÃ­ fyrst og fremst static complexity/query-path mat, ekki mÃ¦ld response-time skÃ½rsla.

---

# A. Executive summary

## NiÃ°urstaÃ°a Ã­ einni mÃ¡lsgrein

GLÃ–GGT er **ekki sÃ©rskrifaÃ° frÃ¡ grunni fyrir eitt fyrirtÃ¦ki**, en Ã¾aÃ° er **ekki enn fullmÃ³taÃ° almennt bÃ³khaldskerfi** heldur. Kjarninn hefur marga sterka almenna eiginleika: company-scoped gÃ¶gn, FinancialEvent/FinancialReconciliation, canonical entities, conservative reconciliation, provenance/audit, accountant-confirmed learning og sÃ­fellt skÃ½rari â€žgÃ¶gn fyrst, AI sÃ­Ã°anâ€œ arkitektÃºr. Ã mÃ³ti eru nokkrar mjÃ¶g mikilvÃ¦gar production-leiÃ°ir enn bundnar sÃ©rreglum eÃ°a eldri heuristics, einkum duplicate/document-instance, Festa-lÃ¡natenging, VSK-reikningar/tÃ­mabil og hluti bankabÃ³kunartengingar. Ãžar aÃ° auki fann Ã©g raunveruleg authorization-gÃ¶t og performance-mynstur sem Ã¾arf aÃ° laga Ã¡Ã°ur en kerfiÃ° stÃ¦kkar mikiÃ°.

## Beint svar viÃ° meginspurningunum

**Hversu heilbrigt er bÃ³khaldskerfiÃ°?**<br>
Grunnurinn er verÃ°mÃ¦tur og aÃ° mÃ­nu mati Ã¾ess virÃ°i aÃ° halda Ã¡fram meÃ°. Hins vegar eru nokkur atriÃ°i Ã­ security, duplicate correctness, transactional boundaries og scalability sem Ã©g myndi setja Ã­ â€žstÃ¶Ã°va frekari ÃºtvÃ­kkun Ã¾essa hluta og laga grunninn fyrstâ€œ flokk.

**Er architecture almennt eÃ°a sÃ©rsniÃ°iÃ°?**<br>
Blanda: almenni kjarninn er raunverulegur, en sumar mikilvÃ¦gar leiÃ°ir eru enn sÃ©rhÃ¦fÃ°ar. **Generic vs bespoke: 6/10.**

**Getur GLÃ–GGT unniÃ° sjÃ¡lfstÃ¦tt meÃ° bÃ³kara?**<br>
JÃ¡, aÃ° verulegu leyti fyrir venjuleg skjÃ¶l, staÃ°fest mynstur, bankafÃ¦rslur og kort. En ekki enn Ã¡ Ã¾ann hÃ¡tt aÃ° nÃ½ tegund endurtekinnar skuldbindingar eÃ°a nÃ½ VSK-/skjalafbrigÃ°i geti alltaf gengiÃ° Ã­ gegn Ã¡n forritara. **SjÃ¡lfstÃ¦Ã°i meÃ° bÃ³kara: 6/10.**

**Eru leit og matching hlutlaus/fullnÃ¦gjandi?**<br>
NÃ½rri reconciliation-lÃ¶gin eru mjÃ¶g gÃ³Ã° og conservative. Duplicate-ingest og legacy receipt-number leiÃ°in eru hins vegar ekki nÃ¦gilega hlutlaus eÃ°a almenn. HeildarmatiÃ° er Ã¾vÃ­ miÃ°lungs-gott, ekki fullnÃ¦gjandi enn.

**Eru alvarleg performance-vandamÃ¡l?**<br>
Ã‰g sÃ© nokkur **byggingarlega staÃ°fest scaling-vandamÃ¡l**: Ã³bounded full-history lestur, O(NÃ—M) candidate-graph vinnsla og afstemmingarsÃ­Ã°a sem keyrir mÃ¶rg overlapping heildarflÃ¦Ã°i samtÃ­mis. Ã‰g sÃ© einnig external Supabase file move inni Ã­ bÃ³kunartransaction. RaunsekÃºndur Ã¾urfa profiling, en Ã¾essir staÃ°ir geta mjÃ¶g trÃºverÃ°ugt skÃ½rt â€žkerfiÃ° nÃ¡nast stopparâ€œ Ã¾egar gagnamagniÃ° vex eÃ°a storage/network hÃ¦gir Ã¡ sÃ©r.

## Fimm mikilvÃ¦gustu atriÃ°in

1. **Authorization/tenant isolation:** nokkrar virkar server actions binda ekki target entity viÃ° authorized company. Ãžetta Ã¾arf tafarlausa lagfÃ¦ringu.
2. **Duplicate architecture:** ingest-lagiÃ° getur merkt endurtekiÃ° obligation reference sem duplicate Ã¡Ã°ur en obligation-instance identity fÃ¦r aÃ° rÃ¡Ã°a.
3. **Document-instance er ekki enn generic discovery:** evidence/envelope kjarninn er gÃ³Ã°ur, en input discovery er enn LOAN/receiptNumber/printed-installment sÃ©rhÃ¦ft og Festa-regla er beinlÃ­nis Ã­ production kÃ³Ã°a/prompti.
4. **Reconciliation scalability:** mÃ¶rg full-history query + O(NÃ—M) candidate graphs + overlapping page loads munu verÃ°a Ã¾ung meÃ° stÃ¦rri fyrirtÃ¦kjum.
5. **Accounting lineage/money/VSK:** ReceiptEntry missir child-document provenance, ledger notar Float Ã¡ meÃ°an nÃ½rri reconciliation notar Decimal/BigInt, og booking-path VSK gerir enn rÃ¡Ã° fyrir 2510/2520/2590 og tveggja mÃ¡naÃ°a periodi.

---

# B. ÃžaÃ° sem er vel gert og Ã¦tti aÃ° varÃ°veita

## 1. Reconciliation-kjarninn er almennt hugsaÃ°ur

**STAÃFEST.** `lib/financial-reconciliation` er eitt sterkasta svÃ¦Ã°i kerfisins.

- Bank â†” booking candidate logic krefst exact signed amount og notar date/party sem evidence.
- `STRONG` verÃ°ur ekki sjÃ¡lfkrafa â€žstaÃ°festâ€œ nema tenging sÃ© unique bÃ¡Ã°um megin.
- Ambiguity er varÃ°veitt Ã­ staÃ° Ã¾ess aÃ° velja fyrsta kandidat.
- Reviewed-document reconciliation notar exact reference, kennitÃ¶lu, party og staÃ°fest company-local learning.
- FinancialEvent matcher varÃ°veitir exact decimal text og notar BigInt parsing Ã­ staÃ° float tolerance.
- Card matcher hefur sÃ©rstaklega gÃ³Ã°a reglu: exact date+amount er fyrst narrow bucket; merchant-string mÃ¡ ekki Ã³sanngjarnt fela augljÃ³st same-day match.

Ãžetta er nÃ¡lÃ¦gt Ã¾eirri hlutlausu leit sem GLÃ–GGT Ã¾arf: safna kandidÃ¶tum, meta evidence, halda ambiguity sÃ½nilegu og faila lokaÃ° Ã¾egar sÃ¶nnun dugar ekki.

## 2. Canonical reviewed-document read model

**STAÃFEST.** NÃ½rri reviewed-document leiÃ°in passar sÃ©rstaklega upp Ã¡ aÃ° parent `Receipt` sÃ© container en ekki heimild fyrir child documents Ã¾egar fleiri skjÃ¶l eru Ã­ sama uploadi. Ãžetta er mjÃ¶g mikilvÃ¦g arkitektÃºrregla og Ã¦tti aÃ° verÃ°a fyrirmynd annars staÃ°ar.

## 3. FinancialEvent / FinancialReconciliation gagnalÃ­kaniÃ°

**STAÃFEST.** `FinancialEvent`, `FinancialEventScheduleItem`, `FinancialReconciliation` og generic participants (`sourceType/sourceKey/role/matchedAmount`) eru almenn abstraktion sem getur tekiÃ° viÃ° banka, korti, skuldbindingum og Ã¶Ã°rum payment-event flÃ¦Ã°um Ã¡n vendor-sÃ©rlÃ­kans.

Ãžetta er gÃ³Ã°ur grunnur fyrir markmiÃ°iÃ° â€žskuldbinding â†’ greiÃ°slutilvik â†’ skjalâ€œ.

## 4. Document-instance evidence/envelope kjarninn

**STAÃFEST.** Innri identity-vÃ©lin hefur marga gÃ³Ã°a eiginleika:

- versioned identity envelope,
- evidence digest,
- source-file hash,
- PROPOSED/CONFIRMED/INVALIDATED transitions,
- audit linkage,
- company-scoped lock,
- evidence verification,
- fail-closed hegÃ°un,
- concurrency/idempotency hugsun.

Vandinn er ekki aÃ° Ã¾essi kjarni sÃ© slÃ¦mur. Vandinn er aÃ° **discovery/input lagiÃ° fyrir framan hann er of sÃ©rhÃ¦ft**. Kjarnann myndi Ã©g varÃ°veita og generalisera input contractiÃ°.

## 5. Accountant-confirmed learning og global product knowledge

**STAÃFEST.** `AccountingPattern` er company-scoped og byggir Ã¡ staÃ°festum Ã¡kvÃ¶rÃ°unum. Global product knowledge hefur sÃ©rstaklega skynsamlega multi-tenant vÃ¶rn:

- company-specific evidence varÃ°veitt,
- `CANDIDATE` mÃ¡ nÃ½tast aftur innan sama fyrirtÃ¦kis,
- cross-company notkun aÃ°eins Ã¾egar Ã¾ekking hefur fengiÃ° sjÃ¡lfstÃ¦Ã°a staÃ°festingu og orÃ°iÃ° `ACTIVE`,
- Ã¡greiningur getur sett Ã¾ekkingu Ã­ `DISPUTED`.

Ãžetta styÃ°ur almennt kerfi frekar en sÃ©rskrifaÃ° kerfi.

## 6. â€žGÃ¶gn fyrst, AI sÃ­Ã°anâ€œ er raunveruleg stefna, ekki bara slagorÃ°

**STAÃFEST aÃ° hluta.** Ã‰g sÃ©:

- deterministic source text varÃ°veitt,
- file hash/ingest key,
- analysis lease,
- canonical facts reused,
- `reconcileReceiptAfterKnowledgeChange` reynir known facts Ã¡Ã°ur en AI fallback er leyft,
- automatic InnsÃ½n les ekki aftur meÃ° AI Ã¾egar booking entries eru Ã¾egar til.

Ãžetta er sterk stefna. AI-prompturinn hefur Ã¾Ã³ safnaÃ° of mikilli domain-policy og nokkrum sÃ©rreglum; Ã¾vÃ­ er AI-lagiÃ° enn ekki hreint extraction-only lag.

## 7. AÃ°gangsstÃ½ringarkjarninn sjÃ¡lfur er gÃ³Ã°ur

**STAÃFEST.** `lib/core/access-control.ts` skilgreinir granular company permissions fyrir prepare/review/reconcile/book/settings og request-scoped aÃ°gang. MÃ¶rg nÃ½rri svÃ¦Ã°i nota entity + company scoped queries rÃ©tt.

Ã–ryggisvandinn sem Ã©g fann kemur fyrst og fremst af Ã¾vÃ­ aÃ° **ekki allar routes/actions nota Ã¾ennan kjarna**.

## 8. Voucher-number og ingestion concurrency

**STAÃFEST.** Unique reservation, atomic next-voucher allocation, ingest key og analysis lease eru gÃ³Ã° dÃ¦mi um aÃ° kerfiÃ° taki race conditions alvarlega.

---

# C. Alvarleg vandamÃ¡l

## CRITICAL 1 â€” Cross-tenant authorization gat Ã­ virku AI-fylgiskjalaactioni

**STAÃFEST.** `app/actions/receiptActions.ts` â†’ `analyzeReceiptWithAIInternal(receiptId)`.

Standard path gerir:

1. `requireActiveCompanyWriteAccess()` â€” staÃ°festir aÃ° notandi megi skrifa Ã­ **active company**.
2. SÃ­Ã°an `prisma.receipt.findUnique({ where: { id: receiptId }})` â€” target receipt er **ekki bundiÃ° viÃ° active company**.

`analyzeReceiptWithAI()` er exportuÃ° server action og er raunverulega kÃ¶lluÃ° Ãºr `app/fylgiskjol/[id]/page.tsx`.

Ãžetta er classic entity-scope/IDOR galli: authorization er Ã¡ company A en entity ID getur vÃ­saÃ° Ã­ company B. Server action sjÃ¡lf verÃ°ur aÃ° staÃ°festa target company; UI routing mÃ¡ ekki vera security boundary.

**Tillaga:** eitt sameiginlegt mynstur: load target meÃ° company relation â†’ `requireCompany...Access(target.companyId)` â†’ aÃ°eins Ã¾Ã¡ vinna. ForÃ°ast â€žauthorize active cookie, then findUnique arbitrary idâ€œ.

## CRITICAL 2 â€” ViÃ°skiptavinir eru global og CRUD actions hafa enga tenant authorization

**STAÃFEST.** `Customer` Prisma model hefur ekkert `companyId`; `kennitala` er global unique. `/vidskiptavinir` sÃ¦kir `prisma.customer.findMany()` Ã¡n fyrirtÃ¦kisskilyrÃ°is. `createCustomer`, `updateCustomer`, `deleteCustomer` hafa enga auth/access athugun.

Proxy krefst session fyrir slÃ³Ã°ina, en session eitt og sÃ©r er ekki tenant authorization.

Ef Ã¾essi module er production-aÃ°gengilegur er Ã¾etta Ã³Ã¡sÃ¦ttanlegt fyrir multi-tenant bÃ³khaldskerfi.

**Tillaga:** annaÃ°hvort quarantine/remove module Ã¾ar til hann er company-scoped, eÃ°a migrate `Customer` yfir Ã­ company-owned entity og nota permission layer Ã¡ Ã¶llum server actions/pages.

## CRITICAL/HIGH 3 â€” `createVatPeriod(companyId, ...)` treystir client-sendu companyId

**STAÃFEST.** `app/actions/vatActions.ts` hefur enga auth/tenant athugun. ActioniÃ° er notaÃ° Ã¡ `/vsk` og tekur `companyId` beint sem parameter.

Notandi sem hefur action reference mÃ¡ ekki geta stofnaÃ° VSK-tÃ­mabil Ã­ Ã¶Ã°ru fyrirtÃ¦ki meÃ° Ã¾vÃ­ aÃ° breyta id.

**Tillaga:** derive company Ãºr authorized request context eÃ°a `requireCompany...Access(companyId)` Ã­ actioninu sjÃ¡lfu.

## HIGH 1 â€” Duplicate-ingest getur tekiÃ° ranga Ã¡kvÃ¶rÃ°un Ã¡Ã°ur en obligation-instance identity kemur aÃ° mÃ¡linu

**STAÃFEST.** `receiptActions.ts`, ingest duplicate block um lÃ­nur 2596â€“2717.

FlÃ¦Ã°iÃ°:

- duplicate logic keyrir aÃ°eins ef `receiptNumber` + merchant identity eru til,
- leitar fyrst fingerprint, en **fingerprint-leitin er sjÃ¡lf inni Ã­ receiptNumber+merchant gate**,
- annars les hÃºn aÃ°eins nÃ½justu `take: 100` docs meÃ° receiptNumber,
- ef sama merchant kennitala + sama normalized receiptNumber finnst, telst kandidat strong duplicate **Ã¡n Ã¾ess aÃ° krefjast sÃ¶mu upphÃ¦Ã°ar eÃ°a sÃ¶mu dagsetningar**,
- setur `duplicateMarkedAt` strax.

SÃ­Ã°an blokkar booking ef `duplicateMarkedAt` er sett.

Ãžetta er nÃ¡kvÃ¦mlega hÃ¦ttulega tilfelliÃ° fyrir endurteknar skuldbindingar: sama lÃ¡n/skuldbinding getur haft stÃ¶Ã°ugt reference yfir mÃ¶rg occurrence. NÃ½rra document-instance lagiÃ° fÃ¦r ekki aÃ° â€žvinnaâ€œ ef ingest hefur Ã¾egar sett duplicate flag.

**False positive:** sama skuldbinding + nÃ½tt occurrence getur veriÃ° stÃ¶Ã°vaÃ°.<br>
**False negative:** fingerprint duplicate Ã¡n receiptNumber/merchant gate fer ekki Ã¾essa cross-upload leiÃ°; einnig getur `take:100` misst eldri kandidat.

**Tillaga:** ingest Ã¡ aÃ° safna `observed reasons/evidence`, ekki gefa endanlegt SAME_INSTANCE verdict nema generic identity engine geti sannaÃ° Ã¾aÃ°.

## HIGH 2 â€” Document-instance discovery er enn loan-/receiptNumber-/regex-sÃ©rtÃ¦kt

**STAÃFEST.** `lib/receipts/document-instance-booking.ts` og `document-instance-identity.ts`.

DÃ¦mi:

- identity kind er `PRINTED_INSTALLMENT_SEQUENCE`,
- orchestration heitir `prepareOneLoanDocumentInstanceIdentity`,
- entry point er `prepareReceiptNumberDocumentInstancesForBooking`,
- metadata parsing skoÃ°ar `loanInfo`, `collectionLetterNumber`, `loanNumber`,
- text parsing leitar aÃ° `Gjaldagi X af Y`, `Afborgun X af Y`, `Installment X of Y`,
- obligation reference regex Ã¾ekkir lÃ¡n/innheimtubrÃ©f/krÃ¶fu labels,
- legacy bootstrap hefur bein 338379 â†’ 0142-338379 hugsun Ã­ comment/logic.

Evidence/envelope kjarninn er gÃ³Ã°ur; discovery-lagiÃ° er ekki enn almenna â€žobligation + occurrence + evidenceâ€œ vÃ©lin.

## HIGH 3 â€” Bein Festa-sÃ©rregla er enn Ã­ production AI prompti og runtime

**STAÃFEST.** `app/actions/receiptActions.ts` inniheldur bÃ³kstaflega `SÃ‰RSTÃ–K FESTA-REGLA` og runtime branch `normalizedLenderName.includes("festa")` til aÃ° para suffix Ã¡ innheimtubrÃ©fi viÃ° staÃ°fest lÃ¡n.

Ãžetta er skÃ½rasta einstaka sÃ¶nnunin um aÃ° GLÃ–GGT er **ekki enn alveg vendor-neutral** Ã­ mikilvÃ¦gum booking/extraction path.

Festa Ã¡ aÃ° verÃ°a acceptance-test fyrir almenna obligation-alias/occurrence vÃ©l, ekki special case.

## HIGH 4 â€” External Supabase file move keyrir inni Ã­ accounting DB transaction

**STAÃFEST.** Ã `approveDetectedDocument()` keyrir `prisma.$transaction(...)`; Ã¾egar sÃ­Ã°asta child document er approved er `receipt.status` uppfÃ¦rt og sÃ­Ã°an kallaÃ° `await archiveReceiptFile(...)` **Ã¡Ã°ur en transaction commit**.

`archiveReceiptFile` notar global `prisma` (ekki transaction client) og bÃ­Ã°ur eftir `supabaseAdmin.storage.move()`.

ÃhÃ¦tta:

- DB transaction og company identity lock geta veriÃ° opin Ã¡ meÃ°an network/storage kall bÃ­Ã°ur,
- hÃ¦g Supabase aÃ°gerÃ° getur lÃ¡tiÃ° â€žBÃ³kaâ€œ virÃ°ast hanga,
- file move getur tekist en DB transaction sÃ­Ã°ar rollbackaÃ°,
- helperinn les/skrifar Ã­ gegnum aÃ°ra DB tengingu og getur sÃ©Ã° annaÃ° state en Ã³committaÃ° transaction state.

**Tillaga:** commit accounting transaction fyrst. Archive Ã­ post-commit job/outbox/retry-able state machine.

## HIGH 5 â€” Bank â†” booked-entry lineage missir child-document identity

**STAÃFEST.** Ãžegar `AiDetectedDocument` er bÃ³kaÃ° eru booking lines afritaÃ°ar Ã­ `ReceiptEntry`, en `ReceiptEntry` hefur aÃ°eins `receiptId`, ekki `documentId`/posting source lineage.

Seinna bank reconciliation les `ReceiptEntry` og notar `entry.receipt.aiDate/date` og `entry.receipt.merchantName/description` sem party/date.

Ãžetta gengur gegn nÃ½rri canonical reviewed-document reglu sem segir aÃ° Receipt sÃ© aÃ°eins container og parent facts megi ekki leka milli sibling documents.

Ef eitt upload inniheldur mÃ¶rg skjÃ¶l getur bankabÃ³kunarlÃ­nan Ã¾vÃ­ misst nÃ¡kvÃ¦ma frumheimild sÃ­na.

**Tillaga:** canonical Journal/Posting model eÃ°a aÃ° minnsta kosti `sourceDocumentId` Ã¡ ledger entry. Afstemming Ã¡ aÃ° nota child-document facts Ã¾egar booking kom Ã¾aÃ°an.

## HIGH 6 â€” Reconciliation query/algorithm scaling er Ã³bounded og oft O(NÃ—M)

**STAÃFEST algorithmically, Ã¡hrif = STERK ÃLYKTUN Ã¾ar til mÃ¦lt.**

- Basic bank-booking loader sÃ¦kir allar bankafÃ¦rslur reiknings og allar approved ReceiptEntries Ã¡ ledger account.
- `buildBankBookingCandidateGraph` keyrir nested loops yfir allar bankafÃ¦rslur Ã— allar booking lines.
- Reviewed-document service sÃ¦kir allar unreconciled bankafÃ¦rslur og Ã¶ll reviewed amount-bearing docs company-wide, sÃ­Ã°an candidate graph.
- Event service sÃ¦kir allar bankafÃ¦rslur og Ã¶ll CHARGE/CREDIT events, sÃ­Ã°an pair evaluation.
- Card service hefur betri exact-date/amount index inni Ã­ memory, en wider recovery getur samt skannaÃ° stÃ³ra document-settiÃ°.

Ãžetta er ekki vandamÃ¡l meÃ° 100â€“1.000 lÃ­nur. ÃžaÃ° verÃ°ur vandamÃ¡l Ã¾egar fyrirtÃ¦ki safnar Ã¡rum af gÃ¶gnum.

## HIGH 7 â€” AfstemmingarsÃ­Ã°an keyrir mÃ¶rg overlapping heildarflÃ¦Ã°i Ã­ einu

**STAÃFEST.** `/banki/[id]/afstemming/page.tsx` keyrir 8 Ã¾jÃ³nustur Ã­ `Promise.all`, meÃ°al annars basic reconciliation, events, diagnostics, reviewed documents, confirmed links, bank-originated candidates og classifications.

Margar Ã¾essara Ã¾jÃ³nusta lesa sÃ¶mu bankafÃ¦rslur/docs/events aftur og byggja eigin projections/graphs.

Parallel er ekki sjÃ¡lfkrafa hraÃ°ara ef Ã¾aÃ° Ã¾Ã½Ã°ir aÃ° DB pool og CPU fÃ¡ mÃ¶rg stÃ³r full-history workloads samtÃ­mis.

**Tillaga:** eitt authorized reconciliation snapshot/read context per request; DB-prefilter eftir date/amount/status; paginate/period-scope; lazy-load diagnostics.

## HIGH/MEDIUM 8 â€” Money representation er Ã³samrÃ¦md; ledger notar Float

**STAÃFEST.** BankTransaction, card transactions, FinancialEvent og reconciliation amounts eru Decimal. En `Receipt.amount`, `ReceiptEntry.debit/credit`, `AiDetectedDocument.totalAmount`, `AiDetectedDocumentEntry` o.fl. eru Float.

Eldri candidate path breytir Ã­ `Number` og `Math.round(number*100)`, Ã¡ meÃ°an nÃ½rri FinancialEvent/reviewed-document matcher notar exact decimal â†’ BigInt.

Fyrir ISK-heiltÃ¶lur mun Ã¾etta oft virka, en accounting truth Ã¦tti ekki aÃ° treysta Ã¡ binary floating-point eÃ°a tolerance Ã¾egar nÃ½rri hluti kerfisins hefur Ã¾egar sÃ½nt betra mynstur.

**Tillaga:** velja eitt money primitive: Decimal eÃ°a integer minor units Ã­ canonical accounting layer.

## HIGH/MEDIUM 9 â€” VSK booking path er aÃ°eins hÃ¡lf metadata-driven

**STAÃFEST.** `assertCompanyVatPostingAllowed` er gÃ³Ã°ur: skoÃ°ar account metadata/type/entryRole. En booking-finalization skoÃ°ar sÃ­Ã°an beint reikninga `2510`, `2520`, `2590` og bÃ½r til VAT period sem `floor(month/2)+1`.

Company model styÃ°ur `vatSettlementType`; VSK UI styÃ°ur `BIMONTHLY`, `MONTHLY`, `ANNUAL`. ÃžrÃ¡tt fyrir Ã¾aÃ° er booking path hardcoded tveggja mÃ¡naÃ°a.

VSK-sÃ­Ã°an sjÃ¡lf hefur einnig bein 2510/2520/2590/3000 assumptions.

Ãžetta er bÃ¦Ã°i genericity- og correctness-gat ef MONTHLY/ANNUAL fyrirtÃ¦ki eiga aÃ° vera fullstudd.

## HIGH/MEDIUM 10 â€” Global chronology guard getur stÃ¶Ã°vaÃ° allt nÃ½rra bÃ³kunarflÃ¦Ã°i

**STAÃFEST.** `approveDetectedDocument()` finnur elsta Ã³bÃ³kaÃ°a document Ã­ fyrirtÃ¦kinu meÃ° eldri dagsetningu og skilar `OLDER_UNBOOKED`.

Ãžetta er sterk bookkeeping policy, en hÃºn er global hard blocker. Eitt gamalt skjal sem gleymist getur stÃ¶Ã°vaÃ° alla nÃ½rri bÃ³kun fyrirtÃ¦kis Ã¾ar til Ã¾aÃ° er afgreitt eÃ°a sett sÃ©rstaklega til hliÃ°ar.

**Mat:** Ã¾etta getur veriÃ° rÃ©tt sem control Ã­ Ã¡kveÃ°nu close/period ferli, en sem almenn dagleg regla er Ã¾aÃ° operationally brittle og passar viÃ° â€žkerfiÃ° nÃ¡nast stopparâ€œ upplifun.

---

# D. Almenn kerfisÃºttekt

## 1. Generic vs bespoke

### ÃžaÃ° sem styÃ°ur generic system

- Flest stÃ³r gagnalÃ­kÃ¶n eru company-scoped.
- FinancialEvent/Reconciliation eru generic source/participant/event abstractions.
- Canonical entity identity er type/value/provenance byggt, ekki vendor table.
- AccountingPattern er company-local learning.
- Product knowledge hefur cross-company evidence gate.
- Bank/card reconciliation er provider-neutral aÃ° meginstefnu.

### ÃžaÃ° sem dregur Ã­ bespoke Ã¡tt

- Festa special rule Ã­ production prompt/runtime.
- Document-instance discovery er Ã­ raun loan installment engine Ã­ dag.
- Bank annual-analysis purpose layer inniheldur curated vendor regex (Nova, Hringdu, veitingastaÃ°ir, BÃ³nus o.fl.). Ãžar er Ã¾etta Ã¾Ã³ research/classification en ekki final booking truth, svo Ã©g met Ã¾aÃ° mun vÃ¦gar en Festa-regluna.
- VSK core gerir rÃ¡Ã° fyrir tilteknum Ã­slenskum account numbers og BIMONTHLY booking period.
- Gamalt `app/data/companies.ts` inniheldur Sturla demo/sample data. VirÃ°ist ekki vera kjarni, en Ã¦tti ekki aÃ° liggja Ã³skÃ½rt Ã­ production source tree.

### DÃ³mur

GLÃ–GGT er **almennt kerfi meÃ° nokkrum mikilvÃ¦gum sÃ©rhÃ¦fÃ°um/legacy svÃ¦Ã°um**, ekki â€žframework sem Ã¾arf aÃ° sÃ©rforrita fyrir hvert fyrirtÃ¦kiâ€œ. En nÃ½tt fyrirtÃ¦ki meÃ° Ã³Ã¾ekkt endurtekiÃ° billing/loan pattern getur enn Ã½tt teyminu aftur Ã­ kÃ³Ã°abreytingar Ã­ staÃ° config/learning.

## 2. Leit og candidate discovery

### Sterkasta leitarlagiÃ°

Reviewed-document/bank/card/event matching er almennt, conservative og evidence-oriented. Ãžetta Ã¡ aÃ° verÃ°a standard pattern alls kerfisins.

### Veikasta leitarlagiÃ°

Duplicate-ingest:

- candidate window `take:100`,
- decision bundin receiptNumber + merchant,
- same kennitala getur gert repeated number aÃ° duplicate Ã¡n occurrence proof,
- fingerprint search Ã³Ã¾arflega bundin viÃ° sama gate.

### Canonical entity search

`resolveCanonicalInsightEntity` hefur gÃ³Ã°a alias/strength merkingu: aÃ°eins STRONG alias mÃ¡ auto-merge, WEAK er takmarkaÃ°. Hins vegar sÃ¦kir resolver Ã¶ll active entities fyrir company+entityType og canonicaliserar/filterar Ã­ memory, Ã¾Ã³ schema hafi index Ã¡ `[companyId, identifierType, identifierValue]`.

Sem correctness er Ã¾etta varfÃ¦rnislegt; sem scale-search Ã¦tti aÃ° Ã¾rengja DB candidate set Ã¡Ã°ur.

## 3. Duplicate-vÃ¶rn

ÃžaÃ° eru Ã­ raun **tvÃ¶ Ã¡kvÃ¶rÃ°unarlÃ¶g sem keppa**:

1. ingest heuristic sem setur `duplicateMarkedAt`,
2. booking-time duplicate evaluation sem hefur nÃ½ja identity-aware `evaluateDocumentDuplicatePair`.

Booking-time lagiÃ° er betra: Ã¾aÃ° skoÃ°ar alla booked docs meÃ° sama receiptNumber og sleppir ekki eftir fyrsta kandidat. En ingest flag blokkar bÃ³kun Ã¡Ã°ur.

Meginbreytingin Ã¦tti Ã¾vÃ­ ekki aÃ° vera â€ženn ein duplicate reglaâ€œ heldur **eitt authoritative duplicate decision pipeline**.

## 4. SjÃ¡lfstÃ¦Ã°i meÃ° bÃ³kara

GLÃ–GGT er Ã¾egar meira en dumb form-entry kerfi. ÃžaÃ° getur:

- lesiÃ° og normaliseraÃ° skjÃ¶l,
- lÃ¦rt company-local reikningsval,
- varÃ°veitt product knowledge,
- fundiÃ° deterministic bank/card candidates,
- varÃ°veitt ambiguity,
- tengt FinancialEvents,
- notaÃ° reviewed canonical facts aftur,
- kallaÃ° AI aÃ°eins Ã¾egar known-facts reconciliation dugar ekki Ã­ Ã¡kveÃ°num flÃ¦Ã°um.

En bÃ³kari + kerfi eru ekki alveg laus viÃ° forritara enn vegna:

- nÃ½rra obligation occurrence formats,
- vendor-specific exception debt,
- hardcoded VAT assumptions,
- canonical lineage gap frÃ¡ child document â†’ final ledger,
- scaling/performance leiÃ°a sem Ã¾arf aÃ° endurbyggja Ã¡Ã°ur en stÃ¦rri gagnasÃ¶fn verÃ°a eÃ°lileg.

## 5. BÃ³khaldslegur gagnakjarni

Styrkur: booking/review/reconciliation eru sÃ­fellt betur aÃ°greind conceptually; FinancialReconciliation er ekki sama og booking status.

Veikleiki: `ReceiptEntry` er of grunnt canonical ledger record fyrir framtÃ­Ã°arsÃ½nina. ÃžaÃ° geymir reikning/texta/debet/kredit/receiptId en ekki fulla source lineage, exact money primitive eÃ°a reconciliation-specific metadata. NÃ½rri abstraktionin utan um Ã¾aÃ° er rÃ­kari en sjÃ¡lft ledger anchor-iÃ°.

## 6. AI

AI er notaÃ° meÃ° 180 sekÃºndna client timeout og stÃ³rum domain prompt. Ingestion getur sett vinnu Ã­ `after()`/lease Ã¾annig aÃ° hluti vinnslunnar er ekki UI-blocking, sem er gott.

En prompturinn inniheldur policy, exceptions og supplier/lender-specific logic sem Ã¦tti helst aÃ° flytjast Ã­ deterministic/configurable knowledge lag. AI Ã¡ aÃ° lesa/ÃºtdrÃ¡tta; canonical policy layer Ã¡ aÃ° Ã¡kveÃ°a meaning/identity/bookability Ã¾egar hÃ¦gt er.

## 7. Security/audit

Audit events eru vÃ­Ã°a mjÃ¶g vel notuÃ°. Company access layer er Ã¡gÃ¦tur. Vandinn er consistency: nokkrar eldri/afmarkaÃ°ar routes/actions fara framhjÃ¡ honum.

Auk virku gatanna fann Ã©g dev-bridge access-audit sem gefur falska security assurance: hann bÃ½r fyrst til `forbiddenPairs` Ã¾ar sem access relation er ekki til og telur sÃ­Ã°an leak aÃ°eins ef `relationExists` er true â€” sem getur aldrei gerst fyrir Ã¾au pÃ¶r. CheckiÃ° `forbiddenPairsHaveNoAccessRelation` getur Ã¾vÃ­ ekki prÃ³faÃ° raunverulegt receipt visibility leak eins og nafniÃ° gefur til kynna.

---

# E. Generic vs bespoke einkunn

## **6/10**

0 vÃ¦ri sÃ©rsmÃ­Ã° fyrir einstÃ¶k dÃ¦mi; 10 vÃ¦ri kerfi Ã¾ar sem eÃ°lileg nÃ½ fyrirtÃ¦ki, bankar, birgjar og skjalafbrigÃ°i krefjast ekki kÃ³Ã°abreytinga.

**Af hverju ekki lÃ¦gra?** Generic company/reconciliation/event/entity/learning abstractions eru raunverulegar og stÃ³r hluti nÃ½rri kÃ³Ã°ans er vendor-neutral.

**Af hverju ekki hÃ¦rra?** Duplicate/document-instance, Festa runtime/prompt, VSK assumptions og ledger lineage sÃ½na aÃ° nokkrar mikilvÃ¦gar production Ã¡kvarÃ°anir eru enn sÃ©rhÃ¦fÃ°ar eÃ°a legacy.

---

# F. SjÃ¡lfstÃ¦Ã°i kerfisins meÃ° bÃ³kara

## **6/10**

GLÃ–GGT getur nÃº Ã¾egar gert verulega sjÃ¡lfstÃ¦Ã°a vinnu og bÃ³kari getur Ã­ mÃ¶rgum flÃ¦Ã°um veriÃ° staÃ°festandi fremur en handvirkur innslÃ¡ttaraÃ°ili.

Til aÃ° komast Ã­ 8â€“9 Ã¾arf:

- generic occurrence/obligation discovery,
- zero vendor-special rules Ã­ authoritative core,
- configuration/knowledge-driven VAT/chart behavior,
- sterk source lineage Ã­ ledger,
- bounded/scalable reconciliation,
- security contract sem er Ã³hjÃ¡kvÃ¦milegt aÃ° nota Ã­ Ã¶llum actions.

---

# G. Leit og hlutleysi â€“ einkunnir

| SviÃ° | Einkunn | Mat |
|---|---:|---|
| Candidate discovery | **6/10** | NÃ½rri reconciliation gott; duplicate ingest og full-history search draga niÃ°ur |
| Canonical matching | **8/10** | Strong/weak identifiers, provenance og reviewed read model eru sterk |
| Duplicate detection | **4/10** | TvÃ¶ competing lÃ¶g; ingest false-positive/false-negative Ã¡hÃ¦tta |
| Reconciliation matching | **8/10** | Conservative, ambiguity-preserving, mutual uniqueness |
| Hlutleysi gagnvart fyrirtÃ¦kjum/vendors | **6/10** | MikiÃ° generic, en Festa/VAT/vendor heuristics sÃ½nileg |
| Fail-closed hegÃ°un | **8/10** | SÃ©rstaklega gÃ³Ã° Ã­ identity/reconciliation; ekki fullkomlega samrÃ¦md um allt kerfiÃ° |

---

# H. Performance â€“ lÃ­klegustu bottleneckarnir

| StaÃ°ur | Evidence | Ãhrif | Confidence | NÃ¦sta skref |
|---|---|---|---|---|
| `/banki/[id]/afstemming` 8 parallel services | STAÃFEST | DB/pool/CPU burst, overlapping reads | HÃ¡tt | Sameina read snapshot, mÃ¦la per-service timing |
| Bankâ†”booking nested candidate graph | STAÃFEST O(NÃ—M) | Vex hratt meÃ° sÃ¶gu | HÃ¡tt | DB prefilter amount/date/status, period scope |
| Bankâ†”FinancialEvent full graph | STAÃFEST O(NÃ—M) | Sama | HÃ¡tt | Query narrow buckets og indexed keys |
| Reviewed docs: all unreconciled tx Ã— all reviewed docs | STAÃFEST | Company history verÃ°ur dÃ½r | HÃ¡tt | Date/amount keyed prefilter, pagination |
| `archiveReceiptFile` innan DB tx | STAÃFEST | BÃ³kun getur hangiÃ° Ã¡ network/storage og haldiÃ° lock | MjÃ¶g hÃ¡tt | Post-commit outbox/job |
| Global chronology lookup | STAÃFEST | BÃ¦Ã°i policy-stop og mÃ¶guleg hÃ¦g relation/date query | MiÃ°lungs-hÃ¡tt | Scope/period control + index eftir query plan |
| Canonical entity resolver full entityType scan | STAÃFEST | HÃ¦gari meÃ° mÃ¶rgum entities | MiÃ°lungs | Nota indexed canonical candidate query fyrst |
| Manual/full AI analysis | STAÃFEST 180s timeout | Getur virst hanga ef kallaÃ° synchronous | MiÃ°lungs | Async job/progress, deterministic fast-path |
| StÃ³r monolith files/UI | STAÃFEST | Ekki beint runtime stop en hÃ¦gir Ã¡ viÃ°haldi/refactor | HÃ¡tt fyrir Ã¾rÃ³un | Skipta domains/services niÃ°ur |

### AtriÃ°i sem Ã¾arf profiling Ã¡Ã°ur en Ã©g fullyrÃ°i um sekÃºndur

Ã‰g myndi ekki setja 1â€“3s / 5â€“10s tÃ¶lur Ã¡ Ã¾essa staÃ°i Ã¡n production trace. Fyrstu mÃ¦lingar Ã¦ttu aÃ° setja `performance.now()`/OpenTelemetry kringum DB read, graph-build, diagnostics og storage move og telja candidate-set sizes. ÃžÃ¡ sjÃ¡um viÃ° hvort latency er DB, CPU eÃ°a external I/O.

---

# I. TÃ¦kniskuld

## VarÃ°veita

- FinancialEvent / FinancialReconciliation abstractions.
- Canonical reviewed-document read model.
- Document-instance envelope/evidence/audit/concurrency kjarna.
- AccountingPattern og global product-knowledge evidence model.
- Access-control permission model.
- Voucher reservation/ingest idempotency/analysis lease.
- Fail-closed/mutual-uniqueness reconciliation philosophy.

## Sameina

- Duplicate ingest + booking duplicate + document-instance Ã­ **eitt authoritative decision pipeline**.
- Bank/card/event candidate source loading Ã­ sameiginlegt scoped reconciliation read model.
- Money representation Ã­ eitt canonical primitive.
- VAT account roles/settlement policy Ã­ metadata/config layer.

## Einfalda

- `app/actions/receiptActions.ts` (~9.000 lÃ­nur) er of stÃ³r boundary. Skipta Ã­ ingestion, extraction, duplicate, booking, VAT, archive, learning, document lifecycle.
- `Work10Dashboard.tsx`, InnsÃ½n page og fleiri mjÃ¶g stÃ³r UI files sÃ½na sambÃ¦rilega monolith skuld utan bÃ³khaldskjarnans.

## Endurhanna

- ReceiptEntry/source lineage.
- Document-instance discovery contract (generic obligation + occurrence evidence, ekki LOAN-only).
- Reconciliation data fetching fyrir scale.
- Global chronology sem hard blocker; fÃ¦ra Ã­ period/close policy eÃ°a guided warning/queue eftir krÃ¶fum.

## FjarlÃ¦gja/quarantine

- Festa special case Ã¾egar generic alias/obligation engine tekur viÃ°.
- Hardcoded `addReceiptEntries()` test/dev action (2550/4530/1510 og fasta amounts) Ãºr production server-action module.
- Global unscoped Customer module Ã¾ar til tenant model er rÃ©tt.
- Dead/sample company data ef Ã¾aÃ° er ekki viljandi fixture.
- Security audit sem gefur falskt PASS; laga eÃ°a fjarlÃ¦gja Ã¾ar til Ã¾aÃ° prÃ³far actual authorized visibility.

---

# J. ForgangsrÃ¶Ã°uÃ° aÃ°gerÃ°arÃ¡Ã¦tlun

## 0. ÃÃ°ur en Ã¶nnur feature-vinna heldur Ã¡fram â€” security containment

1. Laga `analyzeReceiptWithAI` Ã¾annig aÃ° receipt company sÃ© authorized target company.
2. Laga `createVatPeriod` meÃ° company access inni Ã­ actioni.
3. Quarantine eÃ°a company-scope `/vidskiptavinir` og customer CRUD.
4. FjarlÃ¦gja/lÃ¦sa niÃ°ur unused exported dev actions (`addReceiptEntries`, `saveOcrResult` ef raunverulega Ã³notaÃ°).
5. BÃ¦ta automated cross-tenant negative tests fyrir allar public server actions.

## 1. Duplicate/obligation architecture

1. Ingest mÃ¡ ekki setja endanlegt duplicate flag Ãºt frÃ¡ repeated reference+merchant alone.
2. Gera eitt generic contract:
   - canonical obligation identity,
   - occurrence identity (typed evidence, ekki ein fixed installment kind),
   - source evidence/provenance,
   - SAME / DISTINCT / INSUFFICIENT.
3. Festa og Ergo verÃ°a acceptance tests, engar vendor branches.
4. Fingerprint duplicate verÃ°ur independent strong reason og mÃ¡ ekki vera hÃ¡Ã° receiptNumber gate.
5. PrÃ³fa >100 historical candidates svo list-cap geti ekki skapaÃ° silent false negative.

## 2. Accounting truth og lineage

1. Tengja final ledger posting viÃ° source document, ekki aÃ°eins Receipt container.
2. Migrate ledger money Ãºr Float Ã­ Decimal/minor units meÃ° audit/reconciliation plan.
3. Metadata-driven VAT roles og period resolver sem virÃ°ir BIMONTHLY/MONTHLY/ANNUAL.

## 3. Performance og transaction boundaries

1. Flytja file archive Ãºt fyrir accounting transaction.
2. BÃºa til eitt reconciliation snapshot per page/request.
3. DB-prefilter candidate sets eftir amount/date/status/source identity.
4. BÃ¦ta viÃ° rÃ©ttum indexes **eftir** EXPLAIN og query shape, ekki blindt.
5. Lazy-load diagnostics og sjaldgÃ¦f deep analysis.
6. Setja mÃ¦lingar Ã¡ candidate counts, DB ms, graph ms, external I/O ms.

## 4. Quality gates

1. BÃ¦ta `test` script Ã­ package og keyra architecture tests Ã­ CI/deploy gate.
2. BÃºa til end-to-end tests sem fara gegnum raunverulegt receipt ingest â†’ review â†’ duplicate â†’ booking, ekki aÃ°eins pure identity engine.
3. Security test matrix fyrir server actions.
4. Performance fixture meÃ° Ã¾Ãºsundum/10k bank rows og reviewed docs.

## 5. SÃ­Ã°an Ã¡fram meÃ° features

Eftir Ã¾essa grunnvinnu myndi Ã©g halda Ã¡fram aÃ° byggja ofan Ã¡ nÃºverandi kerfi. Ã‰g sÃ© ekki Ã¡stÃ¦Ã°u til wholesale rewrite.

---

# K. LokaniÃ°urstaÃ°a

Ef Ã©g kÃ¦mi aÃ° GLÃ–GGT Ã­ dag sem Ã³hÃ¡Ã°ur tÃ¦knilegur rÃ¡Ã°gjafi myndi Ã©g **ekki stoppa verkefniÃ° og endurskrifa kerfiÃ°**. Grunnurinn er of gÃ³Ã°ur og of mikiÃ° af rÃ©ttum abstractions er Ã¾egar komiÃ° til aÃ° rewrite sÃ© skynsamlegt.

Ã‰g myndi hins vegar **stÃ¶Ã°va tÃ­mabundiÃ° frekari ÃºtvÃ­kkun Ã¡ Ã¾remur svÃ¦Ã°um** Ã¾ar til grunnurinn er lagaÃ°ur:

1. duplicate/document-instance/recurring obligations,
2. reconciliation scale/performance,
3. security/tenant boundaries Ã¡ server actions og eldri modules.

SÃ­Ã°an myndi Ã©g laga source lineage + money/VAT consistency Ã¡Ã°ur en bÃ³khaldskjarninn er talinn tilbÃºinn fyrir breiÃ°ari, Ã³fyrirsjÃ¡anlega fyrirtÃ¦kjaflÃ³ru.

MikilvÃ¦gasta jÃ¡kvÃ¦Ã°a niÃ°urstaÃ°an er Ã¾essi: **GLÃ–GGT er ekki fast Ã­ sÃ©rsmÃ­Ã°i.** ÃžaÃ° er nÃº Ã¾egar meÃ° raunverulegan generic kjarna. En Ã¾aÃ° hefur safnaÃ° nokkrum sÃ©rleiÃ°um Ã­ kringum raunvandamÃ¡l Ã¡Ã°ur en almenna abstractionin var fullmÃ³tuÃ°. RÃ©tta nÃ¦sta skrefiÃ° er ekki aÃ° bÃ¦ta fleiri sÃ©rreglum viÃ° â€” heldur aÃ° lÃ¡ta nÃ½ja generic kjarnann taka endanlegt Ã¡kvÃ¶rÃ°unarvald og fjarlÃ¦gja gÃ¶mlu samhliÃ°a leiÃ°irnar.

MikilvÃ¦gasta neikvÃ¦Ã°a niÃ°urstaÃ°an er Ã¾essi: **sum nÃ½ju almennu lÃ¶gin eru rÃ©tt Ã­ einangrun en ekki enn authoritative Ã­ end-to-end production flow.** Duplicate-ingest er skÃ½rasta dÃ¦miÃ°. GrÃ¦n unit/identity prÃ³f geta Ã¾vÃ­ gefiÃ° meiri Ã¶ryggistilfinningu en raunflÃ¦Ã°iÃ° Ã¡ skiliÃ° ef eldri lag tekur Ã¡kvÃ¶rÃ°un fyrr.

---

# ViÃ°auki â€“ snapshot/tÃ¦knileg athugun

- Handwritten `app` (Ã¡n generated Prisma): um 209 TS/TSX skrÃ¡r / 81.527 lÃ­nur.
- `lib`: um 209 skrÃ¡r / 44.279 lÃ­nur.
- `components`: 59 skrÃ¡r / 8.532 lÃ­nur.
- `scripts`: 27 skrÃ¡r / 4.867 lÃ­nur.
- Test-skrÃ¡r fundnar: 41.
- Prisma schema: um 120 models og mikiÃ° index/unique coverage.
- StÃ¦rsta handwritten accounting action file: `app/actions/receiptActions.ts`, um 9.063 lÃ­nur / 304 KB.
- `package.json` hefur `dev`, `build`, `start`, `lint` en ekkert `test` script Ã­ Ã¾essu snapshoti.
- TypeScript er `strict: true`.

Ãžessar tÃ¶lur eru ekki sjÃ¡lfar gÃ¦Ã°adÃ³mur, en monolith-stÃ¦rÃ°in skÃ½rir hvers vegna eldri og nÃ½rri policy lÃ¶g geta lifaÃ° samhliÃ°a og verÃ°ur mikilvÃ¦gt aÃ° skÃ½ra ownership/boundaries Ã¡Ã°ur en kÃ³Ã°inn stÃ¦kkar mikiÃ° meira.
