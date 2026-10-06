# GLÃ–GGT â€“ sameiginleg niÃ°urstaÃ°a tveggja Ã³hÃ¡Ã°ra kerfisÃºttekta

**Dagsetning:** 6. oktÃ³ber 2026<br>
**Tilgangur:** Sameina tvÃ¦r Ã³hÃ¡Ã°ar Ãºttektir Ã¡ sama GLÃ–GGT-snapshoti Ã­ hlutlausan grunn fyrir nÃ¦sta vinnuplan.<br>
**Heimildir:**
1. Ã“hÃ¡Ã° static code/architecture Ãºttekt ChatGPT Ã¡ snapshoti 6. oktÃ³ber 2026.
2. Ã“hÃ¡Ã° Astra-Ãºttekt Ã¡ vinnueintaki `C:\GLÃ–GGT`, meÃ° kÃ³Ã°alestri og keyrslu 364 staÃ°bundinna prÃ³fa (0 failures), en Ã¡n production E2E, raun-concurrency, PostgreSQL integration og performance profiling.

---

# 1. YfirlitsniÃ°urstaÃ°a

TvÃ¦r Ã³hÃ¡Ã°ar aÃ°ferÃ°ir lenda Ã¡ mjÃ¶g svipuÃ°um meginniÃ°urstÃ¶Ã°um:

- **GLÃ–GGT er ekki sÃ©rsmÃ­Ã° fyrir eitt fyrirtÃ¦ki.** ÃžaÃ° er kominn raunverulegur almennur kjarni.
- **GLÃ–GGT er heldur ekki enn fullmÃ³taÃ° almennt sjÃ¡lfstÃ¦tt bÃ³khaldskerfi.** Nokkur eldri/sÃ©rhÃ¦fÃ° lÃ¶g rÃ¡Ã°a enn mikilvÃ¦gum end-to-end Ã¡kvÃ¶rÃ°unum.
- **Ekki er Ã¡stÃ¦Ã°a til heildarendurskrifunar.** Sterku almennu lÃ¶gin eiga aÃ° varÃ°veitast og verÃ°a authoritative.
- **ÃÃ°ur en meiri sjÃ¡lfvirkni er bÃ¦tt viÃ° Ã¾arf aÃ° laga grunninn Ã¡ afmÃ¶rkuÃ°um sviÃ°um:** authorization/tenant boundaries, final posting invariants/idempotency, duplicate/obligation-instance authority, review/content revision, transaction boundaries og reconciliation scale.
- **Performance Ã¾arf bÃ¦Ã°i arkitektÃºrviÃ°gerÃ°ir og raunmÃ¦lingar.** BÃ¡Ã°ar Ãºttektir finna Ã³skalanleg mynstur, en engin production sekÃºndutala er staÃ°fest Ã¡n profiling.

SamantekiÃ° mat:

- **Generic vs bespoke:** 6/10 Ã­ bÃ¡Ã°um Ãºttektum.
- **SjÃ¡lfstÃ¦Ã°i meÃ° bÃ³kara:** 5â€“6/10.
- **Duplicate detection:** 4/10 Ã­ bÃ¡Ã°um.
- **Sterkustu svÃ¦Ã°i:** FinancialEvent/Reconciliation, ambiguity/mutual uniqueness, canonical reviewed-document read model, source/evidence/audit og company-local learning.
- **Veikustu svÃ¦Ã°i:** end-to-end posting authority, authorization consistency, legacy duplicate preemption, generic occurrence discovery og stÃ³r/unbounded candidate-flÃ¦Ã°i.

---

# 2. AtriÃ°i sem bÃ¡Ã°ar Ãºttektir fundu sjÃ¡lfstÃ¦tt

Ãžessi atriÃ°i fÃ¡ hÃ¦sta forgang vegna Ã¾ess aÃ° tvÃ¦r Ã³hÃ¡Ã°ar skoÃ°anir komust aÃ° sÃ¶mu niÃ°urstÃ¶Ã°u frÃ¡ Ã³lÃ­kum sjÃ³narhornum.

## 2.1 Authorization/tenant isolation er ekki samrÃ¦mt framfylgt

BÃ¡Ã°ar Ãºttektir fundu server-side mutation-leiÃ°ir Ã¾ar sem aÃ°gangur aÃ° virku fyrirtÃ¦ki jafngildir ekki Ã¶ruggri authorization Ã¡ target entity.

Sameiginleg niÃ°urstaÃ°a:
- proxy/session-cookie er ekki object authorization,
- allar mutations Ã¾urfa actor + target-company + exact capability,
- security boundary mÃ¡ ekki treysta Ã¡ UI/page routing.

**Forgangur: Critical.**

## 2.2 Duplicate-lagiÃ° tekur enn Ã¡kvÃ¶rÃ°un Ã¡Ã°ur en almenn occurrence-identity fÃ¦r aÃ° rÃ¡Ã°a

BÃ¡Ã°ar Ãºttektir fundu aÃ° ingest/legacy duplicate getur merkt eÃ°a blokkaÃ° skjal Ãºt frÃ¡ repeated reference/receipt number + merchant Ã¡Ã°ur en canonical obligation/occurrence evidence er metiÃ°.

Sameiginleg niÃ°urstaÃ°a:
- nÃ½ja identity-hugmyndin er sterkari en end-to-end wiring,
- duplicate Ã¾arf eitt authoritative decision pipeline,
- repeated reference er ekki sjÃ¡lfkrafa document-instance identity,
- Festa/Ergo eiga aÃ° vera acceptance corpus, ekki reglur Ã­ core.

**Forgangur: High / architecture blocker.**

## 2.3 Document-instance discovery er enn of lÃ¡nasÃ©rtÃ¦kt

BÃ¡Ã°ar Ãºttektir benda Ã¡ `LOAN`, prentaÃ°a installment sequence, receipt/reference labels og Festa-sÃ©rhÃ¦fingu sem merki um aÃ° discovery-lagiÃ° sÃ© ekki enn generic obligation/occurrence engine.

Sameiginleg niÃ°urstaÃ°a:
- evidence/envelope/CAS/audit kjarninn Ã¡ aÃ° varÃ°veitast,
- input contract/discovery Ã¾arf aÃ° verÃ°a generic og typed,
- nÃ½ occurrence-tegund Ã¡ ekki aÃ° krefjast nÃ½rrar vendor-reglu.

**Forgangur: High.**

## 2.4 `receiptActions.ts` er of stÃ³rt Ã¡kvÃ¶rÃ°unarlag

BÃ¡Ã°ar Ãºttektir komast aÃ° Ã¾vÃ­ aÃ° ein skrÃ¡ ber of margar skyldur: storage, PDF, AI, identity, learning, VSK, review, duplicate, posting og lifecycle.

Sameiginleg niÃ°urstaÃ°a:
- vandinn er ekki bara file-size,
- stÃ¦rÃ°in gerir legacy og nÃ½ policy lÃ¶g kleift aÃ° lifa samhliÃ°a,
- ownership og endanlegt Ã¡kvÃ¶rÃ°unarvald verÃ°ur Ã³skÃ½rt.

**Forgangur: Medium-High eftir aÃ° correctness/security er lokaÃ°.**

## 2.5 Reconciliation performance er ekki skalanlegt Ã­ nÃºverandi heildarleit

BÃ¡Ã°ar Ãºttektir finna:
- unbounded/all-history fetches,
- NÃ—M candidate graphs,
- mÃ¶rg overlapping services Ã¡ afstemmingarsÃ­Ã°u,
- repeated canonical/PDF work.

Sameiginleg niÃ°urstaÃ°a:
- query/discovery Ã¾arf scoped amount/date/status/identity buckets,
- ranking mÃ¡ koma eftir discovery,
- diagnostics Ã¦ttu aÃ° vera lazy eÃ°a byggÃ° Ã¡ sameiginlegu snapshoti,
- mÃ¦la Ã¾arf p50/p95, query counts, candidate sizes, pool wait og CPU graph-time.

**Forgangur: High Ã¡Ã°ur en magn og sjÃ¡lfvirkni aukast.**

## 2.6 Archive/storage inni Ã­ accounting transaction er rangt boundary

BÃ¡Ã°ar Ãºttektir finna `archiveReceiptFile`/Supabase storage vinnu inni Ã­ posting transaction.

Sameiginleg niÃ°urstaÃ°a:
- external I/O Ã¡ ekki aÃ° halda accounting transaction/lock opnum,
- storage failure mÃ¡ ekki breyta accounting truth,
- flytja Ã­ post-commit outbox/job meÃ° idempotent retry.

**Forgangur: High.**

## 2.7 Child-document â†’ final ledger lineage er of veik

BÃ¡Ã°ar Ãºttektir finna aÃ° final `ReceiptEntry` varÃ°veitir parent receipt en ekki nÃ¡kvÃ¦ma child document/posting identity.

Sameiginleg niÃ°urstaÃ°a:
- Ã¾etta getur lÃ¡tiÃ° container facts leka aftur inn Ã­ reconciliation,
- canonical source lineage Ã¾arf aÃ° lifa alla leiÃ° Ã­ final ledger/posting,
- fjÃ¶lskjala PDF er mikilvÃ¦gt acceptance case.

**Forgangur: High-Medium.**

## 2.8 Money/VSK configuration er Ã³samrÃ¦md milli nÃ½rra og eldri laga

BÃ¡Ã°ar Ãºttektir finna Float Ã­ receipt/ledger Ã¡ mÃ³ti Decimal/BigInt Ã­ nÃ½rri reconciliation, og fÃ¶st VSK account/period assumptions.

Sameiginleg niÃ°urstaÃ°a:
- skilgreina eina monetary contract/rounding policy,
- VSK roles og settlement period eiga aÃ° koma Ãºr metadata/config,
- migration Ã¾arf aÃ° vera stÃ½rÃ°; ekki blind mass-conversion.

**Forgangur: Medium-High.**

## 2.9 Ekki endurskrifa GLÃ–GGT

BÃ¡Ã°ar Ãºttektir eru skÃ½rar: grunnurinn er verÃ°mÃ¦tur og sterk abstractions eru Ã¾egar til.

VarÃ°veita sÃ©rstaklega:
- FinancialEvent / FinancialReconciliation,
- mutual uniqueness og ambiguity-preserving matching,
- canonical reviewed-document read model,
- source hash / provenance / audit / CAS,
- company-local learning,
- conservative confirmation logic.

---

# 3. AtriÃ°i sem Astra fann sÃ©rstaklega eÃ°a sÃ½ndi sterkari sÃ¶nnun fyrir

Ãžessi atriÃ°i eiga ekki lÃ¦gra vÃ¦gi bara vegna Ã¾ess aÃ° Ã¶nnur Ãºttekt fann Ã¾au ekki. Ãžvert Ã¡ mÃ³ti bÃ¦ta Ã¾au viÃ° sameiginlega myndina.

## 3.1 Critical: mÃ¶gulegt concurrent double-posting Ã¡ sama skjali

Astra rakti race Ã¾ar sem tvÃ¦r beiÃ°nir geta bÃ¡Ã°ar lesiÃ° `approvedAt = null` fyrir transaction, Ã¶nnur bÃ³kar, en hin endurles ekki/claim-ar source undir lÃ¦singunni og getur Ã¾vÃ­ bÃ³kaÃ° aftur meÃ° Ã¶Ã°ru voucher-nÃºmeri.

Ãžetta er mikilvÃ¦gasta nÃ½ja niÃ°urstaÃ°an Ãºr Astra-skoÃ°uninni.

**Sameiginleg afstaÃ°a:** final posting Ã¾arf source-level claim/re-read/idempotency inni Ã­ sÃ¶mu transaction og posting.

**Forgangur: Critical.**

## 3.2 Final posting er ekki eitt sameiginlegt accounting-invariant gate

Astra sÃ½nir aÃ° draft/editor validation er ekki endilega endurkeyrÃ° viÃ° final posting og aÃ° manual/AI posting-leiÃ°ir hafa mismunandi invariant coverage.

Ãžarf eitt authoritative posting gate sem sannreynir aÃ° lÃ¡gmarki:
- actor/capability,
- target company,
- source revision,
- review/workflow requirements,
- account ownership/validity,
- debit/credit semantics,
- exact balance/amount,
- currency/date,
- VAT policy,
- source idempotency,
- audit.

**Forgangur: Critical/High.**

## 3.3 Review er timestamp en ekki content revision

Astra finnur aÃ° reviewed draft getur breyst eftir review Ã¡n Ã¾ess aÃ° review/FinancialEvent/derived identity verÃ°i sjÃ¡lfkrafa stale.

**Sameiginleg afstaÃ°a:** review Ã¾arf aÃ° staÃ°festa tiltekna content revision. Breyting Ã¡ material facts Ã¾arf aÃ° Ã³gilda/stale-a review og afleidd gÃ¶gn.

**Forgangur: High.**

## 3.4 Workflow settings eru ekki endilega server-enforced

Astra fann stillingar fyrir review/reconciliation/approval/AUTO_BOOK sem ekki virÃ°ast vera ein sameiginleg server policy Ã­ posting path.

**Sameiginleg afstaÃ°a:** stilling sem er sÃ½nd sem control verÃ°ur aÃ° hafa authoritative server meaning eÃ°a vera fjarlÃ¦gÃ° Ãºr UI Ã¾ar til svo er.

**Forgangur: High.**

## 3.5 Canonical entity resolver ambiguity er Ã³samrÃ¦md

Astra finnur aÃ° eitt lag getur valiÃ° preferred candidate Ã¡ meÃ°an annaÃ° hafnar fleiri en einu confirmed match.

**Sameiginleg afstaÃ°a:** einn canonical ambiguity contract og explicit namespace/uniqueness policy Ã¾arf aÃ° rÃ¡Ã°a alls staÃ°ar.

**Forgangur: High-Medium.**

## 3.6 Exact-date kortaleit getur faliÃ° sterkari non-exact candidate

Astra setur fram gagnlegt mÃ³tdÃ¦mi Ã¾ar sem same-day amount match frÃ¡ rÃ¶ngum aÃ°ila getur ÃºtilokaÃ° sterkari party/identity candidate daginn Ã¡Ã°ur.

Ãžetta er mikilvÃ¦gt vegna Ã¾ess aÃ° hin Ãºttektin mat exact-date bucketiÃ° jÃ¡kvÃ¦Ã°ar.

**Sameiginleg afstaÃ°a:** Ã¾etta skal ekki leysa meÃ° Ã¡liti. BÃºa Ã¾arf til acceptance test sem ber saman:
- weak exact-date/amount candidate,
- strong party/reference candidate Ã¡ DÂ±1,
- mutual uniqueness,
- visibility/ranking Ã¡n candidate-hiding.

**Forgangur: Medium en mikilvÃ¦gt fyrir hlutleysi leitar.**

## 3.7 Astra keyrÃ°i 364 tests, 0 failures

Ãžetta styrkir traust Ã¡ pure/newer modules en sannar jafnframt ekki end-to-end correctness vegna Ã¾ess aÃ°:
- PostgreSQL integration var ekki keyrt,
- production E2E var ekki keyrt,
- real concurrency var ekki keyrÃ°,
- performance profiling var ekki keyrt.

**NiÃ°urstaÃ°a:** grÃ¦n unit/service tests eru asset en ekki release-proof fyrir posting/security/concurrency.

---

# 4. AtriÃ°i sem ChatGPT-Ãºttektin fann sÃ©rstaklega eÃ°a drÃ³ skÃ½rar fram

## 4.1 Global `Customer` module Ã¡n company scope

Static Ãºttektin fann `Customer` model/CRUD sem globalt svÃ¦Ã°i Ã¡n `companyId` og Ã¡n tenant authorization.

Ãžetta fellur inn Ã­ stÃ¦rra authorization-mynstriÃ° sem Astra fann Ã­ Ã¶Ã°rum actions.

**Forgangur: Critical ef module er production-aÃ°gengilegt; annars quarantine Ã¾ar til tenant model er skilgreint.**

## 4.2 `analyzeReceiptWithAI` authorization er active-company scoped en target receipt arbitrary

Static Ãºttektin fann aÃ° target entity authorization getur glatast Ã­ AI receipt action.

Ãžetta bÃ¦tist viÃ° action-lista Astra og styrkir niÃ°urstÃ¶Ã°una aÃ° Ã¾Ã¶rf sÃ© Ã¡ sameiginlegum target-object authorization helper, ekki punktaviÃ°gerÃ°um.

**Forgangur: Critical.**

## 4.3 Global chronology guard sem operational hard blocker

Static Ãºttektin drÃ³ `OLDER_UNBOOKED` fram sem architecture/operational issue: eitt gamalt skjal getur stÃ¶Ã°vaÃ° nÃ½rri bÃ³kun company-wide.

Astra nefndi sama UX-effect en setti Ã¾aÃ° ekki jafn hÃ¡tt sem architecture-control.

**Sameiginleg afstaÃ°a:** sannreyna business requirement. Ef Ã¾etta er close/period control Ã¡ Ã¾aÃ° aÃ° vera explicit period policy, ekki falinn company-wide daglegur blocker.

**Forgangur: Medium-High vegna notendaflÃ¦Ã°is.**

## 4.4 Access-audit check sem gÃ¦ti gefiÃ° falskt PASS

Static Ãºttektin fann security-audit/dev check sem virÃ°ist ekki geta sannreynt Ã¾aÃ° sem nafniÃ° gefur til kynna vegna mÃ³tsagnar Ã­ predicate/selection.

**Sameiginleg afstaÃ°a:** security tests skulu prÃ³fa actual unauthorized visibility/mutation meÃ° negative E2E/service cases, ekki aÃ°eins metadata assumptions.

**Forgangur: Medium en mikilvÃ¦gt fyrir traust Ã¡ security gates.**

## 4.5 Hardcoded VSK settlement period var dregiÃ° fram skÃ½rar

BÃ¡Ã°ar Ãºttektir sjÃ¡ fÃ¶st VSK accounts, en static Ãºttektin lagÃ°i sÃ©rstaka Ã¡herslu Ã¡ aÃ° booking path reiknar tveggja mÃ¡naÃ°a period Ã¾Ã³tt company model styÃ°ji MONTHLY/ANNUAL.

**Forgangur: Medium-High correctness/configuration.**

---

# 5. AtriÃ°i Ã¾ar sem Ãºttektirnar eru ekki alveg sammÃ¡la

Ã“samrÃ¦mi er ekki galli Ã­ ferlinu. ÃžaÃ° sÃ½nir hvar mÃ¦ling eÃ°a acceptance test Ã¡ aÃ° rÃ¡Ã°a.

## 5.1 SjÃ¡lfstÃ¦Ã°i kerfisins: 5/10 vs 6/10

Astra: 5/10.<br>
ChatGPT static Ãºttekt: 6/10.

Sameiginleg tÃºlkun:
- munurinn er lÃ­till og snÃ½st meira um hversu mikiÃ° vÃ¦gi er gefiÃ° end-to-end gloppum,
- bÃ¡Ã°ar eru sammÃ¡la aÃ° kerfiÃ° sÃ© meira en formkerfi en minna en fullmÃ³tuÃ° sjÃ¡lfstÃ¦Ã° generic vÃ©l.

**Sameiginlegt vinnumat: 5â€“6/10, ekki nota eina tÃ¶lu sem KPI.**

## 5.2 Reconciliation matching: 6/10 vs 8/10

Astra lÃ¦kkar mat vegna partial/FX/schedule coverage, exact-date hiding og provider-policy mismunar. Static Ãºttektin gaf meiri einkunn fyrir conservative matching, ambiguity og mutual uniqueness.

**HÃ©r Ã¾arf test-matrix, ekki meÃ°altal.**

MÃ¦la/prÃ³fa:
- exact-date weak vs near-date strong,
- partial payment,
- aggregate/batched payment,
- refund/credit direction,
- FX,
- long payment delay,
- disposed/duplicate eligibility,
- mutual uniqueness.

## 5.3 Canonical matching: 6/10 vs 8/10

Static Ãºttektin lagÃ°i Ã¡herslu Ã¡ strong/weak identifiers og provenance. Astra fann Ã³samrÃ¦mda ambiguity-policy og namespace/uniqueness gap.

**Sameiginleg niÃ°urstaÃ°a:** grunnurinn er sterkur, en authoritative resolver contract er ekki nÃ³gu samrÃ¦mdur til aÃ° halda 8/10 Ã¡n viÃ°gerÃ°ar.

## 5.4 Fail-closed: 5/10 vs 8/10

Static Ãºttektin mat nÃ½ja identity/reconciliation core mjÃ¶g hÃ¡tt. Astra mat end-to-end kerfiÃ° lÃ¦gra vegna auth/posting/review gloppa og Ã¾ess aÃ° false duplicate er lÃ­ka rÃ¶ng lokun.

**Sameiginleg niÃ°urstaÃ°a:** pure cores â‰ˆ sterk; end-to-end â‰ˆ miÃ°lungs. Ãžetta er ekki raunveruleg mÃ³tsÃ¶gn heldur mismunandi scope.

---

# 6. Sameiginleg orsakarÃ³t â€“ hvaÃ° er Ã­ raun aÃ° gerast?

Flest vandamÃ¡lin eru ekki Ã³hÃ¡Ã°ir gallar. Ãžau koma Ãºr einu stÃ¦rra mynstri:

> **NÃ½rri, almenn og vel prÃ³fuÃ° lÃ¶g eru komin inn Ã­ GLÃ–GGT, en eldri production-leiÃ°ir og server actions hafa ekki enn veriÃ° fÃ¦rÃ°ar undir eitt authoritative policy/posting/identity contract.**

AfleiÃ°ingar:
- nÃ½ identity-vÃ©l getur veriÃ° rÃ©tt en legacy duplicate blokkar fyrr,
- access-control model getur veriÃ° gott en action sleppir target-object check,
- review getur veriÃ° rÃ©tt concept en timestamp lifir Ã¡fram eftir content change,
- reconciliation core getur veriÃ° conservative en provider discovery felur candidate,
- FinancialEvent getur veriÃ° generic en final ledger source lineage er grynnri,
- workflow settings geta veriÃ° til en posting framfylgir Ã¾eim ekki,
- tests geta veriÃ° grÃ¦n Ã¡ pure layer Ã¡ meÃ°an end-to-end wiring hefur race.

Ãžetta er mikilvÃ¦gt vegna Ã¾ess aÃ° lausnin er **ekki fleiri sÃ©rreglur** og ekki rewrite. Lausnin er aÃ° gera almennu lÃ¶gin authoritative og fjarlÃ¦gja/afmarka bypass-leiÃ°ir.

---

# 7. Sameiginleg forgangsrÃ¶Ã°un fyrir nÃ¦sta vinnuplan

Ãžetta er ekki fulla vinnuplaniÃ°; Ã¾etta er rÃ¶Ã°in sem vinnuplaniÃ° Ã¦tti aÃ° byggja Ã¡.

## Fasi 0 â€” Freeze Ã¡ viÃ°kvÃ¦mri ÃºtvÃ­kkun

Ekki bÃ¦ta viÃ° nÃ½jum vendor/loan/duplicate sÃ©rreglum eÃ°a meiri auto-posting Ã¾ar til fasar 1â€“3 eru lokaÃ°ir.

Halda mÃ¡ Ã¡fram meÃ° Ã³hÃ¡Ã° UI/feature verk sem snertir ekki posting/identity/security core, en ekki breikka authority surface.

## Fasi 1 â€” Security + final posting correctness

1. Sameiginleg target-object authorization fyrir allar mutations.
2. Audit yfir allar exported server actions.
3. Source-level posting claim/idempotency inni Ã­ transaction.
4. Eitt final posting invariant gate fyrir manual + AI + framtÃ­Ã°arleiÃ°ir.
5. Negative cross-tenant tests og real concurrent posting test Ã¡ PostgreSQL.

**Exit criteria:** tvÃ¦r concurrent beiÃ°nir geta ekki tvÃ­bÃ³kaÃ°; user Ã­ A getur ekki breytt B; allar posting leiÃ°ir fara Ã­ sama invariant gate.

## Fasi 2 â€” Review/content revision + derived truth

1. Content revision fyrir reviewed document.
2. Breyting eftir review stale-ar review/FinancialEvent/identity/learning eftir skÃ½rum reglum.
3. Workflow controls verÃ°a server-enforced.
4. Bank/card eligibility samrÃ¦md.

**Exit criteria:** enginn derived truth getur haldist â€žconfirmed/currentâ€œ ef material source content hefur breyst.

## Fasi 3 â€” Generic obligation/occurrence/duplicate authority

1. Eitt typed contract fyrir obligation identity + occurrence identity + source evidence.
2. Legacy duplicate verÃ°ur evidence-provider, ekki endanlegur dÃ³mari.
3. Issuer/reference namespace explicit.
4. Festa/Ergo/SjÃ³vÃ¡/insurance/subscription/etc. verÃ°a acceptance cases.
5. Sama invoice/reference hjÃ¡ Ã³lÃ­kum issuer mÃ¡ ekki collision-a.
6. Sama obligation + nÃ½tt occurrence = DISTINCT; sama occurrence = SAME; insufficient = review.

**Exit criteria:** engin vendor-name eÃ°a label-regla Ã¾arf aÃ° vera Ã­ authoritative core til aÃ° acceptance corpus standist.

## Fasi 4 â€” Transaction boundaries + performance

1. Archive/storage eftir commit meÃ° outbox/job.
2. Sameiginlegt reconciliation snapshot/read context.
3. Indexed/scoped candidate discovery; ranking eftir discovery.
4. Lazy diagnostics.
5. PDF/source parsing cache eftir source hash + parser version.
6. Runtime instrumentation: p50/p95, query count, DB ms, CPU graph ms, pool wait, candidate count, storage/AI time.

**Exit criteria:** acceptance/performance fixture meÃ° stÃ³rum datasets og skilgreindum latency budgets.

## Fasi 5 â€” Ledger lineage + money/VSK consistency

1. Final posting/ledger line tengd nÃ¡kvÃ¦mu source document/posting ID.
2. Monetary contract Decimal eÃ°a minor units.
3. Metadata-driven VAT roles og settlement periods.
4. StÃ½rÃ° migration/samanburÃ°arÃºttekt Ã¡ eldri gÃ¶gnum.

**Exit criteria:** eitt canonical source lineage og eitt monetary/VAT authority contract.

## Fasi 6 â€” UX/operational blockers og cleanup

1. Endurmeta global chronology guard.
2. Precompute recurring suggestions frekar en hydration effect.
3. FjarlÃ¦gja/quarantine dead/legacy exported actions.
4. BrjÃ³ta `receiptActions.ts` upp eftir domains Ã¾egar authority boundaries eru orÃ°nar skÃ½rar.
5. SamrÃ¦ma notendavillur og â€žnÃ¦sta skrefâ€œ diagnostics.

---

# 8. Acceptance corpus sem Ã¦tti aÃ° verja nÃ½ja grunninn

NÃ¦sta architecture mÃ¡ ekki teljast tilbÃºin nema aÃ° minnsta kosti Ã¾essi cases sÃ©u sjÃ¡lfvirkt prÃ³fuÃ°:

### Security/posting
- user meÃ° aÃ°gang aÃ° A reynir mutation Ã¡ object Ã­ B,
- VIEWER reynir import/book/delete,
- tvÃ¦r concurrent posting requests Ã¡ sama source,
- retry eftir timeout skapar ekki aÃ°ra posting,
- storage archive failure hefur engin Ã¡hrif Ã¡ accounting truth.

### Identity/duplicate
- Festa 16/480 vs 17/480,
- sama Festa 17/480 aftur,
- Ergo 12/24â€“17/24 meÃ° stÃ¶Ã°ugu krÃ¶funÃºmeri,
- sama invoice number hjÃ¡ tveimur Ã³lÃ­kum issuer,
- sama occurrence meÃ° breyttu/non-authoritative reference,
- nÃ½tt occurrence meÃ° sama obligation reference,
- unknown occurrence format â†’ review, ekki vendor-rule.

### Review/derived truth
- review 10.000 â†’ edit 12.000 â†’ old event/identity stale,
- VAT deduction edit eftir review,
- account change eftir review,
- disposed/duplicate doc getur ekki confirmed-a aftur meÃ° gÃ¶mlum request.

### Search neutrality
- weak exact-date candidate vs strong Dâˆ’1 candidate,
- tveir equally strong candidates â†’ ambiguity,
- candidate eldra en 100/120 recency cap,
- canonical identifier collision Ã­ rÃ©ttu namespace,
- same raw identifier Ã­ tveimur issuer namespaces.

### Reconciliation breadth
- partial payment,
- aggregate/batch payment,
- credit/refund direction,
- FX,
- long payment term,
- sibling documents Ã­ sama PDF,
- legacy + child-posting mixed data.

### Performance
- 1k / 10k / 50k bank rows,
- stÃ³rt reviewed-document corpus,
- candidate graph cardinality mÃ¦ld,
- afstemming page p50/p95,
- repeated PDF history parse cache hit/miss,
- DB pool wait og query counts.

---

# 9. HvaÃ° Ã¡ sÃ©rstaklega EKKI aÃ° gera

BÃ¡Ã°ar Ãºttektir styÃ°ja Ã¾essi varnarmÃ¶rk:

- Ekki bÃ¦ta V21/V22 vendor/regex reglum viÃ° duplicate core.
- Ekki gera strong-looking candidate sjÃ¡lfvirkt confirmed Ã¡n uniqueness/evidence.
- Ekki fjarlÃ¦gja ambiguity til aÃ° hÃ¦kka automation-rate.
- Ekki treysta page/proxy auth Ã­ staÃ° server object authorization.
- Ekki laga posting race bara meÃ° voucher-number uniqueness.
- Ekki setja external storage/network I/O inn Ã­ accounting transaction.
- Ekki sameina FinancialEvent, posting og reconciliation Ã­ einn mega-object/service.
- Ekki framkvÃ¦ma wholesale rewrite Ã¡ GLÃ–GGT.
- Ekki optimiza React/UI Ã¡Ã°ur en server/query/I/O profiling sÃ½nir aÃ° Ã¾aÃ° sÃ© raunverulegur bottleneck.

---

# 10. Sameiginleg lokaniÃ°urstaÃ°a

GLÃ–GGT er Ã¡ mikilvÃ¦gum vendipunkti: **generic kjarninn er kominn nÃ³gu langt til aÃ° hann eigi aÃ° taka viÃ° endanlegu Ã¡kvÃ¶rÃ°unarvaldi af eldri sÃ©rleiÃ°um.**

ÃžaÃ° sem tvÃ¦r Ã³hÃ¡Ã°ar Ãºttektir sÃ½na er ekki aÃ° verkefniÃ° hafi fariÃ° Ã­ ranga Ã¡tt. Ãžvert Ã¡ mÃ³ti sÃ½na Ã¾Ã¦r aÃ° rÃ©ttir byggingarhlutar eru Ã¾egar til, en end-to-end flÃ¦Ã°iÃ° hefur ekki enn veriÃ° fullkomlega fÃ¦rt undir Ã¾Ã¡.

Ãžess vegna er besta nÃ¦sta skrefiÃ°:

1. loka security og posting correctness,
2. binda review viÃ° content revision,
3. gera obligation/occurrence/duplicate aÃ° einu almennu authority-lagi,
4. laga transaction boundaries og mÃ¦la performance,
5. styrkja ledger lineage og monetary/VAT contract,
6. hreinsa sÃ­Ã°an legacy og operational UX blockers.

Ef Ã¾essi rÃ¶Ã° er fylgd Ã¾arf ekki aÃ° fÃ³rna â€žsÃ¡lâ€œ GLÃ–GGT eÃ°a Ã¾eirri sÃ½n aÃ° kerfiÃ° vinni sjÃ¡lfstÃ¦tt meÃ° bÃ³kara. Ãžvert Ã¡ mÃ³ti er Ã¾etta lÃ­klegasta leiÃ°in til aÃ° gera Ã¾Ã¡ sÃ½n raunverulega almenna: bÃ³kari staÃ°festir faglegt mat og ambiguity; forritari Ã¾arf ekki aÃ° kenna kerfinu nÃ½jan vendor Ã­ hvert sinn sem nÃ½tt dÃ¦mi kemur upp.

---

# 11. Grunnur fyrir nÃ¦sta skjal: vinnuplan

NÃ¦sta skjal Ã¦tti aÃ° breyta fasarÃ¶Ã°inni hÃ©r aÃ° ofan Ã­ framkvÃ¦manlegt plan meÃ°:

- nÃ¡kvÃ¦mum workstreams,
- dependencies,
- acceptance criteria per task,
- test strategy,
- migration/rollback plan,
- mÃ¦lipunktum fyrir performance,
- checkpoints/commits,
- og skÃ½rri reglu um hvaÃ° mÃ¡ vinna samhliÃ°a Ã¡n Ã¾ess aÃ° rugla core refactor.

Ãžar Ã¡ ekki aÃ° byrja Ã¡ â€žhvaÃ° er fljÃ³tlegast aÃ° kÃ³Ã°aâ€œ, heldur Ã¡ **hvaÃ° minnkar mest correctness/security/architecture Ã¡hÃ¦ttu meÃ° minnstu Ã³Ã¾arfa endursmÃ­Ã°i**.
