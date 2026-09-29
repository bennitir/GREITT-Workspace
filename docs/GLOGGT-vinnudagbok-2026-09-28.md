# GLÖGGT – vinnudagbók 28. september 2026

**Dagsetning:** mánudagur 28. september 2026  
**Dagslok:** um kl. 23:00  
**Meginþemu dagsins:** Innsýn og bókhaldsflæði, lán/tryggingar, rekjanlegar greiðsluafstemmingar, almenn hönnun fjármálaafstemminga, ítarleg repo-/diskhreinsun, production-build og Turbopack tracing lagfæring.

---

## 1. Yfirlit dagsins

28. september varð bæði arkitektúr- og stöðugleikadagur.

Fyrri hluti vinnunnar færði Innsýn og bókhaldsflæðið áfram, sérstaklega varðandi virk lán, tryggingarstöðu og rekjanleg tengsl milli greiðslna og bókhalds. Í afstemmingarhönnuninni var tekin mikilvæg ákvörðun: ekki byggja sértækt bankafærslu↔bókunarlag, heldur almennt reconciliation-lag sem getur síðar tengt allar viðeigandi fjármálaheimildir.

Seinni hluti dagsins fór í mjög varfærna hreinsun á `C:\GLÖGGT` og tengdum gömlum vinnumöppum. Engum óvissum gögnum var hent; þau voru ýmist varðveitt í Git undir skýrari legacy-slóðum eða flutt með hash-/byte-staðfestingu í `.local-archive`.

Dagurinn endaði á fullri tæknilegri staðfestingu:

- TypeScript hreint;
- Prisma schema gilt;
- production build hreint;
- Turbopack dynamic-filesystem tracing warningar fjarlægðir með þröngri runtime-markeringu;
- local `main` push-að á `origin/main`;
- `origin/main...HEAD = 0 / 0`;
- Vercel Production fyrir `899c993` varð **Ready**.

Production-smoke-test er viljandi frestað til morguns.

---

## 2. Innsýn og bókhaldsflæði – checkpoint dagsins

Fyrstu commit dagsins voru:

- `93399f1` – **Checkpoint Innsyn og bokhaldsflæði 28. september**
- `82b118b` – **Nota aðeins virk lán í fylgiskjölum**
- `772b76b` – **Reikna virka tryggingastöðu í Innsýn**
- `9db2e9b` – **Bæta við rekjanlegri greiðsluafstemmingu**
- `5c937e1` – **Staðfesta rekjanlega greiðsluafstemmingu**

Þessi vinna staðfesti áfram meginstefnuna:

**gögn fyrst, deterministic tengingar og rekjanleiki fyrst; AI aðeins þar sem túlkunargat er eftir.**

### Virk lán

Fylgiskjöl eiga ekki að leggja gömul/lokuð lán fram eins og þau séu virk við val og reconciliation. Virkni láns er hluti af sannleikslagi kerfisins.

### Tryggingarstaða

Innsýn á að reikna og sýna virka tryggingastöðu út frá rekjanlegum gögnum en ekki einfaldlega telja allar eldri tryggingatengingar sem núverandi.

### Rekjanleg greiðsluafstemming

Greiðslutengingar voru færðar í átt að því að vera rekjanlegar staðreyndir, þannig að síðar megi svara:

- hvaða peningahreyfing greiddi hvað;
- hvaða bókun/skuldbindingu greiðslan tengist;
- hvaða hluti fjárhæðar var paraður;
- hvaða heimild og staðfesting liggur að baki.

---

# 3. Fjármálaafstemmingar – hvar við stoppuðum

Þetta er mikilvægasti handoff-punkturinn fyrir næstu lotu.

## 3.1 Kjarnareglan

Við festum eftirfarandi hugsun:

**Bankafærsla / greiðslufærsla sannar að peningar færðust.  
Bókun segir hvert fjárhagslegt eðli færslunnar er.  
Afstemming tengir þetta tvennt og varðveitir sönnunina.**

Þetta á ekki aðeins við um banka og Receipt.

Almenna vélin þarf að geta stutt meðal annars:

- 1 ↔ 1;
- 1 ↔ mörg;
- mörg ↔ 1;
- bankafærsla ↔ bókun;
- bankafærsla ↔ krafa/skuldbinding;
- kortauppgjör;
- innri millifærslur;
- hlutaafstemmingar;
- síðar fleiri source-gerðir án nýrrar sértöflu fyrir hvert tilfelli.

## 3.2 Mikilvæg ákvörðun: ekki sértæk `BankTransactionBookingMatch`

Við vorum komin mjög nálægt því að smíða sértæka tengitöflu fyrir bankafærslu↔bókun.

Sú leið var stöðvuð.

Ástæðan er að hún hefði leyst eitt tilfelli en byggt nýjan sérkóða þar sem GLÖGGT þarf almenna fjármálaafstemmingarvél.

Næsta schema-hönnun sem var mótuð en **ekki enn sett inn** er í anda:

### `FinancialReconciliation`

Haus / afstemming:

- company;
- reconciliation type;
- status;
- confidence;
- source/origin;
- confirmedBy / confirmedAt;
- audit timestamps.

### `FinancialReconciliationParticipant`

Þátttakandi í afstemmingu:

- `sourceType`;
- `sourceKey`;
- `role`;
- `matchedAmount` sem jákvæð fjárhæð;
- metadata eftir þörfum.

Polymorphic `sourceType + sourceKey` gerir vélinni kleift að tengja ólíkar heimildir án þess að búa til sértæka match-töflu fyrir hvert par.

**Engin Prisma migration fyrir þetta almenna reconciliation-lag var búin til í dag.**

## 3.3 Núverandi reconciliation-lög sem eiga að lifa áfram

Tvö eldri lög eiga ekki að vera eyðilögð eða endurnefnd í almenna fjármálaafstemmingu:

### Receipt / known-facts reconciliation

`lib/insight/reconciliation.ts` og `lib/receipts/reconciliation.ts` vinna með canonical staðreyndir úr fylgiskjölum, entity identity, staðfest account links og bókunarendurmat.

Markmið þeirra er meðal annars að forðast óþarfa AI-endurlestur.

Þetta er **skjala-/bókunarreconciliation**, ekki almenn bankafstemming.

### Canonical entity/account links

`InsightEntityAccountLink` er almennt entity→Account mapping og er nytsamlegt sannleikslag, en er ekki sjálft greiðsluafstemming.

## 3.4 Núverandi `/banki/[id]/afstemming`

Síðan er enn með einfalt, tímabundið heuristic:

- nálæg dagsetning;
- absolute fjárhæð;
- texta-/mótaðilasamsvörun;
- receipt-level leit;
- niðurstaðan er ekki almennt persisted reconciliation truth.

UI/slóð má nýtast áfram, en backend þarf síðar að byggjast á almenna reconciliation-laginu.

`BankTransaction.status = RECONCILED` má ekki verða aðalsannleikur fyrir hina almennu afstemmingu; slíkt status er aðeins coarse/legacy ástand.

## 3.5 Fyrsta góða deterministic próftilfellið

Næsta örugga reconciliation-próf var skilgreint:

- `ReceiptEntry #584`
- `Receipt #145`
- `BankTransaction #305`
- dagsetning: **30. janúar**
- mótaðili/texti: **Greiðslustofa**
- fjárhæð: **324.243 kr.**
- nákvæm dagsetningar-/fjárhæðar-/mótaðilasamsvörun.

Þetta er góður fyrsti 1↔1 kandídat þegar almenna lagið er smíðað.

### Viljandi tvírætt próf

`ReceiptEntry #563`, fjárhæð **-22.160 kr.**, hefur fleiri en einn nákvæman bankakandídat.

Kerfið má **ekki giska** í slíku tilfelli.

Þetta verður mikilvægt fail-closed próf fyrir candidate selection.

## 3.6 Næsta reconciliation-skref

Eftir production-smoke-test á morgun:

1. staðfesta schema-samhengi read-only aftur;
2. bæta almenna `FinancialReconciliation` / participant líkaninu við með þröngri migration;
3. halda receipt-specific reconciliation óbreyttu;
4. byggja deterministic candidate-matching lag sem gefur evidence/confidence en auto-staðfestir aðeins ótvírætt tilfelli;
5. prófa fyrst Greiðslustofu 324.243 kr.;
6. prófa síðan 22.160 kr. tvíræða dæmið og staðfesta að kerfið stoppi án ágiskunar;
7. færa `/banki/[id]/afstemming` yfir á almenna backend-ið í litlum skrefum.

---

# 4. Repo- og diskhreinsun

Hreinsunin var framkvæmd með þeirri reglu að **ekkert óvíst væri eytt**.

## 4.1 `.gitignore` og staðbundin vinnugögn

Commit:

`3eb6b41` – **Hunsa staðbundin GLÖGGT vinnugögn**

Bætt við viljandi local svæðum:

- `/.scratch/`
- `/.local-archive/`

`.local-archive` er staðbundið safn og er **ekki** Git/remote-afrit.

## 4.2 Skemmd / mojibake skráarnöfn

Commit:

`7ebb5e4` – **Hreinsa skemmd skranofn i docs**

Þrjú tracked skjöl voru endurnefnd sem 100% Git-renames yfir í hrein ASCII/heppileg heiti, án efnisbreytinga.

## 4.3 Vinnudagbækur og breytingaskjöl

Commit:

`0702e53` – **Vardveita vinnudagbok og breytingaskjol**

Mikilvæg skjöl sem höfðu safnast í vinnutrénu voru varðveitt í Git, þar á meðal:

- sameinuð vinnudagbók til 25. september;
- vinnudagbók 26. september;
- vinnudagbók 27. september;
- GPS-vinnulog;
- Fylgiskjöl data-first / PDF vinnuskjöl;
- Banki/Kort gögn.

## 4.4 Gömul `Copy` afrit

Commit:

`c9751c8` – **Hreinsa gomul Copy afrit ur repo**

11 gömul tracked `Copy`-afrit voru fjarlægð eftir samanburð við virkar skrár.

Merkingarbærar skrár með orðinu `copy`, t.d. `mixed-copy.ts` og `task-reminder-copy.ts`, voru ekki snertar.

## 4.5 Tvítekin `LESTU` skjöl í root

Commit:

`ed23dde` – **Hreinsa tvitekin LESTU skjol ur rot**

Fjórar root-skrár reyndust textalega nákvæmlega sömu skjöl og útgáfur undir `docs/verk`, að undanskildum línuendingum.

Root-afritin voru því fjarlægð; `README.md` varð eftir sem eðlileg root-skrá.

## 4.6 Gamalt GREITT changelog

Commit:

`637ca55` – **Faera gamalt GREITT changelog i legacy skjol**

Skráin:

`#L01f4c4 CHANGELOG.md`

var ekki rusl; hún geymdi GREITT v0.4.0 Design System sögu.

Hún var varðveitt 100% óbreytt sem:

`docs/legacy/GREITT-CHANGELOG-v0.4.0-20260810.md`

## 4.7 Gömul prófunar-CSV

Commit:

`8f4190f` – **Hreinsa gamla GLOGGT prufuskra ur root**

`GLÖGGT-prufa.csv` var gömul tracked prófunarskrá með einu dæmi um staðgreiðslu/tryggingagjald.

Engar tilvísanir fundust í repo.

Áður en hún var tekin úr Git var staðfest:

- archive-afrit hafði sama SHA256 og vinnuskráin;
- `core.autocrlf=true` útskýrði raw blob mun;
- filtered archive blob var nákvæmlega sami Git blob og `HEAD`.

Afrit er áfram í `.local-archive`.

## 4.8 Gömul viðhaldsskript

Commit:

`d499e48` – **Faera eldri vidhaldsskript i legacy**

Níu gamlar SQLite/einnota viðhaldsskrár voru færðar úr root í:

`scripts/legacy/2026-08/`

Allar voru `R100` Git-renames, 0 insertions / 0 deletions.

Þær innihéldu meðal annars gömul:

- account fixes;
- merchant kennitöluuppfærslur;
- voucher 469 dagsetningarfix;
- veitingafærslumigration;
- account role/VSK stillingar.

Engin virk tilvísun í skráarnöfnin fannst.

---

# 5. Staðbundið archive – varðveisla

Eldri möppur og gögn voru ekki hent heldur færð í `.local-archive`, meðal annars:

- gömul worktree config-afrit;
- fylgiskjala quarantine;
- `GLÖGGT geymsla`;
- `GLÖGGT-BACKUP`;
- eldri GLÖGGT vinnupakkar;
- root legacy möppur;
- `_dev-package`;
- `temp-baseline-check`;
- `temp-yesterday`;
- `GLÖGGT-prufa.csv`.

Fyrir mikilvæg move/copy skref voru file count, byte count og/eða SHA256 borin saman áður en source var fjarlægt.

Mikilvæg athugasemd:

**`.local-archive` er ignored og er því ekki hluti af GitHub/Vercel checkpointinu.**

---

# 6. Turbopack filesystem tracing

Production build kláraðist fyrst með warningum í:

`lib/insight/document-analyzer.ts`

Ástæðan var viljandi runtime filesystem-aðgangur:

- `existsSync(localPath)`
- `readFile(fullPath)`
- `createReadStream(fullPath)`

`fullPath` getur verið:

1. local frumskjal undir `public/...`; eða
2. tímaskrá undir `os.tmpdir()/gloggt-insight` sem var sótt úr Supabase Storage.

Turbopack gat ekki ákvarðað dynamic slóðirnar og varaði við að allt project gæti verið traced inn í server output.

Þröng lagfæring var gerð:

- `/*turbopackIgnore: true*/` á nákvæmlega þessi þrjú viljandi runtime köll.

Commit:

`899c993` – **Forðast óþarfa Turbopack filesystem tracing**

### Staðfesting

Eftir breytinguna:

- `npx tsc --noEmit` hreint;
- `npm run build`:
  - Compiled successfully;
  - TypeScript lokið;
  - 71/71 static pages generated;
  - engar fyrri dynamic filesystem tracing warningar;
- aðeins þrjár línubreytingar í diffi.

---

# 7. Loka Git / Production staða

Fyrir push var staðfest:

- `origin/main...HEAD = 0 14`;
- engin remote-only commit;
- hreint worktree;
- fast-forward mögulegt.

Push:

`4778ab4..899c993  main -> main`

Eftir push:

- `git status -sb` → `## main...origin/main`
- `git rev-list --left-right --count origin/main...HEAD` → **0 0**
- `HEAD`, `origin/main` og `origin/HEAD` → **899c993**

Vercel sýndi:

- commit **899c993**
- Environment: **Production**
- Status: **Ready**
- build um **1m46s**

Þetta er production-checkpoint dagsins.

---

# 8. Hvað á að prófa á morgun

Production-smoke-test var viljandi ekki gerður í kvöld.

Fyrsta verkefni næstu lotu:

1. opna production og staðfesta almenna virkni eftir `899c993`;
2. prófa Fylgiskjöl:
   - opna fylgiskjal;
   - frumskjal/viewer;
   - zoom/pan;
   - prentun eftir þörfum;
3. prófa Innsýn helstu sýn og nýjustu bókhaldsbreytingar;
4. staðfesta að document analysis / Supabase fallback virki eftir Turbopack tracing breytinguna;
5. þegar smoke-test er grænt, halda áfram með **almennu fjármálaafstemminguna** frá stöðunni í kafla 3.

---

# 9. Ekki gleyma

- Ekki endurvekja sértækt `BankTransactionBookingMatch` sem aðalhönnun.
- Ekki nota `BankTransaction.status=RECONCILED` sem source of truth fyrir almennar afstemmingar.
- Ekki repurpose-a receipt-specific known-facts reconciliation.
- Afstemmingar eiga að vera rekjanlegar, partial-capable og geta stutt mörg source-types.
- Tvírætt match má ekki auto-staðfesta.
- Skuldir Sturlu má ekki álykta út frá núverandi fylgiskjölum einum; skulda-/lána- og reiknings-/kortayfirlit munu berast síðar.
- `.local-archive` er local varðveisla, ekki remote backup.

---

# 10. Dagsniðurstaða

28. september endaði á sterkum og hreinum stöðupunkti.

GLÖGGT er nú með:

- betri Innsýn/bókhaldsgrunn;
- skýrari virk lán/tryggingar sannleikslög;
- rekjanlegri greiðslutengingar;
- mótaða almenna fjármálaafstemmingarhönnun;
- mjög hreina verkefnisrót;
- varðveitta legacy-sögu í réttum möppum;
- hreint TypeScript/Prisma/build;
- og fullkomlega samstillt Git + Vercel Production á `899c993`.

**Næsti upphafspunktur: production-smoke-test, síðan almenn fjármálaafstemming.**
