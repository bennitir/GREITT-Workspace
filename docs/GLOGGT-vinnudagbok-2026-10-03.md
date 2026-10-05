# GLÖGGT – vinnudagbók 3. október 2026

**Dagsetning:** laugardagur 3. október 2026  
**Óskað tímabil:** frá um kl. 08:00 og fram yfir miðnætti / undirbúning næturhvíldar  
**Athugasemd um tíma:** hér er skráð vinna dagsins í þeirri röð sem hún fór fram; tímabilið er ekki reiknað sem samfelldar vinnustundir.  
**Meginþemu dagsins:** Fylgiskjöl/VSK stöðugleiki, kortainnflutningur og duplicate-vörn, atomic import og provenance, sameining Sala inn á `main`, production-smoke á Sölu, ógilding sölu, greiðsluvörn, i18n-lagfæring, krafa um sölustöð og undirbúningur að raunverulegu sölunúmeri.

---

## 1. Yfirlit dagsins

Dagurinn færði GLÖGGT áfram á nokkrum stórum sviðum, en rauði þráðurinn var sá sami og áður: **deterministic hegðun, fail-closed varnir, rekjanleiki og aðgreining rekstrarstaðreynda frá tæknilegum auðkennum.**

Fyrri hluti dagsins fór í að festa breytingar í Fylgiskjölum/VSK og klára raunverulegan galla í greiðslukortainnflutningi þar sem sama færsla gat litið út fyrir að vera ný vegna millisekúndufráviks í tíma.

Síðan var kortainnflutningurinn styrktur enn frekar með atomic transaction-flæði og rekjanlegum `ImportBatch` provenance-gögnum.

Eftir það var Sala-greinin sameinuð inn í `main`. Í kjölfarið var farið í raunverulegt production-smoke, sem leiddi í ljós tvo mikilvæga hluti:

1. ógildingarheimild var til en notendaaðgerðin sjálf vantaði;
2. `Sale.id` var ranglega farið að líta út eins og raunverulegt sölunúmer.

Kvöld- og næturlotan kláraði fyrst ógildingarferlið, bætti fail-closed greiðsluvörn við það, lagaði nýja tungumálatexta og gerði virka sölustöð að kröfu fyrir allar nýjar sölur.

Við stöðvum fyrir nóttina rétt áður en schema/migration-vinna fyrir raunverulegt sölunúmer hefst.

---

# 2. Fylgiskjöl / VSK – checkpoint festur

Fyrri vinna við fylgiskjalalærdóm og VSK-val var yfirfarin og fest.

Commit:

`851a76b` – **Stabilize receipt learning and VAT selection**

Staðfesting:

- 10/10 markviss próf græn;
- `tsc --noEmit` hreint;
- breytingar festar áður en farið var í næsta stóra verkefni dagsins.

Þetta varð checkpoint áður en áherslan færðist yfir í greiðslukortainnflutning.

---

# 3. Greiðslukort – duplicate-vörn fyrir tímamismun

## 3.1 Vandamálið

Rannsókn á kortainnflutningi hafði sýnt að færslur sem voru í raun þegar til gátu birst sem nýjar ef falinn Excel-/timestamp-hluti var örlítið frábrugðinn.

Sérstaklega var `.999` á móti `.000` sekúndubroti nægilegt til að eldri fingerprint-regla sæi tvær færslur sem ólíkar.

Þetta var raunverulegur duplicate-galli, ekki bara sjónrænt UI-frávik.

---

## 3.2 Ný fingerprint-regla

Innflutningsfingerprint var hert þannig að tími er canonicalized deterministically í stað þess að treysta hráu millisekúndugildi.

Nýja hegðunin:

- tími er normaliseraður að sekúndu;
- legacy-samhæfi er varðveitt svo eldri fingerprint-gögn falli ekki út;
- nýr innflutningur á ekki að búa til duplicate vegna eins millisekúndufráviks.

Commit:

`0ecfd11` – **Harden payment card import duplicate matching**

Production-smoke með raunverulegu sýnishorni:

- 120 línur skoðaðar;
- **0 nýjar**;
- **120 þegar til**;
- **0 villur**.

Þetta staðfesti að 22 fölsku „Tilbúið“ færslurnar frá fyrri rannsókn voru ekki raunverulega nýjar.

---

# 4. Kortainnflutningur gerður atomic

Eftir fingerprint-lagfæringuna var innflutningsferlið sjálft hert.

Markmiðið var að forðast hálfklárað ástand ef villa kæmi upp mitt í innflutningi.

Nýja flæðið heldur saman innan transaction:

- PREVIEW → IMPORTING;
- tenant/card-sannprófun;
- duplicate-sannprófun;
- `createMany` með `skipDuplicates`;
- lokastaða batch;
- talning á innfluttum og duplicate færslum.

Commit:

`919509c` – **Make payment card import atomic**

Mikilvæg takmörkun:

- ekkert `TEST_DATABASE_URL` var til staðar;
- því var ekki keyrt destructive DB integration-test gegn sérstökum test-gagnagrunni í þessari lotu.

Pure/TypeScript validation hélt áfram að vera notuð og production-flæðið var prófað varlega.

---

# 5. ImportBatch provenance og migration

Kortainnflutningur fékk síðan aukinn rekjanleika á batch-stigi.

Bætt við `ImportBatch`:

- `sourceFileSha256`;
- `sourceFileSize`;
- `importedCount`;
- `duplicateCount`;
- `completedAt`;
- viðeigandi index.

Migration:

`20261003215000_add_import_batch_provenance`

Migration var keyrð og staðfest í production.

Samhliða var missing local sales migration saga endurheimt úr Sala-worktree svo migration-sagan héldi réttri samfellu.

Commit:

`8ddff27` – **Add import provenance and restore sales migration history**

---

# 6. Sala-grein sameinuð inn í main

Sala hafði verið þróuð í sér worktree:

`C:\GLÖGGT-SALA`

á branch:

`feature/sala-v1`

Eftir að migration-sagan og aðalrepoið voru tilbúin var Sala sameinuð inn í `main`.

Merge commit:

`2a76255` – **Merge sales foundation into main**

Merge-ið bætti inn stórum grunnpakka fyrir Sölu, þar á meðal:

- Sala workspace;
- sölustaði og sölustöðvar;
- aðgangsheimildir;
- domain/service/repository lag;
- server actions;
- próf;
- Prisma schema/migration grunn.

Production build varð Ready.

Worktree-ið `C:\GLÖGGT-SALA` var **ekki eytt** og er áfram varðveitt þar til sérstaklega verður ákveðið annað.

---

# 7. Fyrsta production-smoke á Sölu

Í production var farið yfir nýja Sala-flæðið.

Notað:

- sölustaður: `Vogar – þjónustusvæði (LT_LOC_VOGAR)`;
- sölustöð: `Afgreiðsla (KASSI-01)`.

## 7.1 Sala #3

Sala #3 var stofnuð og sölulína prófuð.

Vegna innsláttar varð:

- quantity: 1;
- unit: `5`;
- unit price: 5.000;
- total með VSK: 6.200.

Þetta leiddi í ljós að taflan sýndi magn og einingu of þétt saman (`1 5`) og þurfti að aðgreina dálkana sjónrænt.

Hold/resume/finalize flæði virkaði.

---

## 7.2 Sala #4

Ný tóm sala var stofnuð.

Rétt hegðun:

- staða `DRAFT`;
- 0 ISK;
- finalize-hnappur óvirkur þar sem engar línur voru til.

Þá kom í ljós að notandinn hafði `SALE_VOID` heimild, en **engin ógildingaraðgerð var í UI**.

Þetta varð næsta verkefni.

---

# 8. Ógilding sölu og greiðsluvörn

Bætt var við raunverulegu void-flæði fyrir `DRAFT` og `HELD`.

Nýtt:

- `VOID` action-policy;
- krefst `SALE_USE + SALE_VOID`;
- `voidSaleAction`;
- void-hnappur í UI;
- confirmation-dialog;
- `CANCELLED` upplýsingaborði;
- idempotent `voidSale()` í service;
- `cancelledAt`;
- `heldAt` hreinsað við ógildingu;
- Quantity og Unit sýnd í aðskildum dálkum.

Mikilvæg fail-closed regla:

> Sala sem hefur **einhverja greiðslufærslu** má ekki fara í einfalt void-ferli.

Því var bætt við:

`hasSalePayments(companyId, saleId)`

og service kastar:

`SALE_WITH_PAYMENTS_CANNOT_BE_VOIDED`

Þetta kemur í veg fyrir orphaned greiðslustöðu þar til sérstakt cancellation/refund-flæði verður byggt.

Commit:

`22acc54` – **Add sale void flow and payment guard**

Staðfesting:

- 14/14 sales action/service próf græn;
- `tsc --noEmit` hreint;
- `git diff --check` hreint;
- production deployment Ready.

---

# 9. Production-smoke á ógildingu

Sala #4 var prófuð í production.

Staðfest:

- „Ógilda sölu“ birtist;
- browser confirmation kom upp;
- staða fór í `Ógilt`;
- söluaðgerðir hurfu;
- upplýsingaborði birtist;
- salan hvarf úr lista yfir opnar sölur.

Þar með var void-flæðið staðfest end-to-end.

---

# 10. i18n – nýju void-textarnir skemmdust í encoding

Production-smoke sýndi að nýju Icelandic/Polish/Serbian void-textarnir höfðu orðið fyrir encoding-skemmdum (`??` / mojibake).

Þetta kom ekki frá eldri i18n-laginu heldur frá patch-aðferð í PowerShell/console.

Viðgerð:

- Unicode stafir settir í source með `\uXXXX` escape;
- íslenska, enska, pólska og serbneska aðskilin aftur;
- `tsc --noEmit` hreint;
- `git diff --check` hreint;
- diff yfirfarinn tungumál fyrir tungumál.

Commit:

`c5ac09a` – **Fix sale void translations**

Þetta varð einnig gagnleg regla fyrir áframhaldandi console-patching:

> Nota ASCII-safe Unicode escapes þegar PowerShell/terminal-encoding getur skemmt literal Unicode.

---

# 11. Sölutalning – `Sale.id` á ekki að vera sölunúmer

Við production-prófun varð augljóst að fyrirsögn eins og:

`Sala #5`

eða síðar:

`Sala #6`

var villandi.

`Sale.id` er tæknilegt gagnagrunnsauðkenni og hækkar líka fyrir:

- tóm drög;
- ógild drög;
- prófanir;
- sölu sem aldrei var framkvæmd.

Ákvörðun dagsins:

> `Sale.id` skal áfram vera innra DB-id, en raunverulegt sölunúmer skal aðeins úthlutað þegar sala verður `FINALIZED`.

Fyrirhuguð regla:

- `DRAFT` → ekkert sölunúmer;
- `HELD` → ekkert sölunúmer;
- `CANCELLED` → ekkert sölunúmer;
- `FINALIZED` → fær varanlegt sölunúmer;
- endurtekið `finalizeSale()` → sama númer, ekkert nýtt númer tekið.

Finalized sala verður síðar leiðrétt með skil/kreditferli, ekki með því að endurnýta eða eyða númeri.

Schema/migration fyrir þetta var **ekki byrjað fyrir nóttina**.

---

# 12. Sölustöð gerð að kröfu fyrir nýjar sölur

Samhliða umræðunni um sölunúmer kom upp önnur arkitektúrniðurstaða:

> Ný raunveruleg sala á ekki að geta stofnast án virkrar sölustöðvar.

Áður var:

`Sale.terminalId Int?`

og service/UI leyfðu `null`.

Ákveðið var að varðveita nullable dálk tímabundið vegna legacy-gagna, en gera kröfuna strax í **nýju create-flæði**.

Breytt:

- `SalesStartClient` velur sjálfkrafa fyrstu virku stöð;
- branch-skipti velur fyrstu stöð nýja branch;
- „Engin sölustöð“ hverfur þegar virk stöð er til;
- „Hefja sölu“ er disabled ef engin stöð er valin;
- `createDraftSaleAction` krefst `terminalId: number`;
- `SalesService.createDraftSale` krefst gilds terminal;
- tenant/branch/active sannprófun helst fail-closed;
- engin Prisma migration gerð í þessu skrefi.

Service-prófið sem áður staðfesti optional terminal var breytt í required-terminal próf.

Staðfesting:

- 14/14 próf græn;
- `tsc --noEmit` hreint;
- `git diff --check` hreint.

Commit:

`6b715ae` – **Require sales terminal for new sales**

Push:

- `main`;
- `origin/main`;
- Vercel production.

---

# 13. Production-smoke á terminal-kröfu

Eftir deployment var `/sala` prófað aftur.

Staðfest:

- `Afgreiðsla (KASSI-01)` valdist sjálfkrafa;
- „Engin sölustöð“ var ekki lengur valkostur þegar virk stöð var til;
- ný sala #6 varð rétt tengd við `Afgreiðsla`.

Þar með er terminal-kröfan staðfest í production.

---

# 14. Undirbúningur að raunverulegu sölunúmeri

Áður en vinnu var hætt fyrir nóttina var lesinn sá kóði sem næsta breyting þarf að byggja á:

- `SaleRecord`;
- `SaleSnapshot`;
- `saleSnapshot()`;
- `SalesTransaction`;
- `MemoryRepository`;
- Prisma repository;
- `finalizeSale()`.

Mikilvægar staðreyndir:

- `finalizeSale()` er þegar transactional;
- repository keyrir Prisma með `Serializable` isolation;
- retry er fyrir `P2034` og `P2002`;
- `finalizeSale()` er þegar idempotent;
- sölulínur eru sannprófaðar og totals reiknaðir áður en sala fer í `FINALIZED`.

Þetta gefur rétta grunninn fyrir atomic sölunúmeraúthlutun.

Fyrirhugað næsta schema:

```text
Sale.id           = innra DB-id
Sale.saleNumber   = null meðan sala er ekki FINALIZED
Sale.saleNumber   = varanlegt númer eftir FINALIZED
```

Fyrirhuguð unique-regla:

```text
@@unique([companyId, saleNumber])
```

Númerið verður ekki byggt á `Sale.id`.

---

# 15. Commit-röð dagsins

Helstu commit dagsins í þeirri röð sem verkefnin lokuðust:

- `851a76b` – **Stabilize receipt learning and VAT selection**
- `0ecfd11` – **Harden payment card import duplicate matching**
- `919509c` – **Make payment card import atomic**
- `8ddff27` – **Add import provenance and restore sales migration history**
- `2a76255` – **Merge sales foundation into main**
- `22acc54` – **Add sale void flow and payment guard**
- `c5ac09a` – **Fix sale void translations**
- `6b715ae` – **Require sales terminal for new sales**

---

# 16. Varðveittar skrár / vinnusvæði

Þekktar untracked skrár í `C:\GLÖGGT` voru vísvitandi látnar ósnertar.

Reglan heldur áfram:

> Ekki nota `git add .` og ekki eyða eða stage-a þessum skrám nema sérstaklega hafi verið ákveðið hvað þær eiga að verða.

Sala-worktree:

`C:\GLÖGGT-SALA`

er einnig áfram varðveitt og ekki á að eyða án sérstakrar ákvörðunar.

---

# 17. Staða við næturhvíld

Við stöðvun er Sala komin með:

- production-grunn;
- sölustaði;
- sölustöðvar;
- skyldubundna virka sölustöð á nýrri sölu;
- free-line;
- exact totals;
- hold/resume;
- finalize;
- void fyrir DRAFT/HELD;
- greiðsluvörn á void;
- action-specific permissions;
- fjögurra tungumála textalag;
- production-smoke á void og terminal-tengingu.

Ekki lokið:

- raunverulegt sölunúmer;
- terminal session / cashier session;
- terminal settlement / dagsuppgjör;
- full payment/checkout orchestration;
- refund/return ferli;
- formleg kvittunar-/reikningsnúmerun.

---

# 18. Fyrsta verkefni næstu lotu

Þegar vinna hefst aftur eftir hádegi á næstu lotu:

## Verkefni 1 – raunverulegt sölunúmer

1. bæta `saleNumber Int?` við `Sale`;
2. setja company-scoped unique constraint;
3. útbúa migration;
4. backfilla aðeins raunverulegar eldri `FINALIZED` sölur ef slíkar eru til;
5. bæta `nextSaleNumber(companyId)` við transaction/repository;
6. úthluta númeri inni í sama SERIALIZABLE transaction og fyrsta `FINALIZED`;
7. tryggja idempotency – repeated finalize má aldrei taka annað númer;
8. bæta prófi sem sýnir að `CANCELLED`/tóm drög eyða engu númeri;
9. hætta að sýna `Sale.id` sem „Sala #...“ í UI;
10. sýna raunverulegt „Sala nr. X“ aðeins þegar sölunúmer er til.

## Verkefni 2 – eftir sölunúmer

Þá er eðlilegt að halda áfram í:

- `TerminalSession` / `CashierSession`;
- `TerminalSettlement`;
- dagsuppgjör per sölustöð;
- upphafssjóð;
- sala eftir greiðslumáta;
- reiðufé inn/út;
- væntanlegt vs. talið;
- kort/aðrar greiðslur;
- frávik;
- audit;
- ný lota á einni stöð óháð öðrum stöðvum.

Grundvallarreglan frá fyrri hönnun heldur:

> Hver sölustöð á að geta lokað sinni eigin lotu og gert sitt dagsuppgjör án þess að bíða eftir öðrum stöðvum sama útibús eða fyrirtækis.

---

# 19. Næturcheckpoint

Síðasti staðfesti production-grunnur Sölu:

`6b715ae` – **Require sales terminal for new sales**

Strax á undan:

`c5ac09a` – **Fix sale void translations**  
`22acc54` – **Add sale void flow and payment guard**

Næsta vinna á **ekki** að byrja á því að endurrannsaka terminal/void-flæðið. Það er þegar staðfest.

Næsta vinna byrjar beint á:

**`Sale.saleNumber` + atomic allocation við `FINALIZED`.**
