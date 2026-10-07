# GLÖGGT – verkdagsskýrsla 7. október 2026

## Yfirlit

Dagurinn fór fyrst í að staðfesta og hreinsa document-instance identity arkitektúrinn, síðan í Production-raunpróf á duplicate-vörn. Raunprófið afhjúpaði almennt gat fyrir skjöl án `receiptNumber`; því var lokað, rangri Sjóvá-tvíbókun var snúið til baka með audit-aðri viðgerð og regression-próf sett inn. Í lok dags var skjalaröð einnig staðfest sem viljandi regla í bókunarferlinu.

---

## 1. Generic document-instance identity – refactor og staðfesting

### Generic executor dreginn út

Commit:

- `2af1ae3` – **Extract generic document instance identity execution**

`PROPOSE → audit → persist → CONFIRM` hlutinn var dreginn út úr loan/installment-sértæka kóðanum í generic executor. Loan/installment discovery hélt sömu hegðun.

Staðfesting:

- `npx tsc --noEmit` hreint
- 85/85 targeted identity/duplicate próf græn
- engin Festa/Ergo hegðunarbreyting

### Installment occurrence discovery provider dreginn út

Commit:

- `4db165b` – **Extract installment occurrence discovery provider**

Loan/installment occurrence discovery var dregið út í sér provider/helper. Generic identity executorinn var óbreyttur.

Staðfesting:

- `npx tsc --noEmit` hreint
- 85/85 targeted identity/duplicate próf græn aftur
- commit varð **Ready í Production**

Þetta skildi arkitektúrinn skýrar:

```text
provider / discovery
        ↓
IdentityCandidate + IdentityEvidence
        ↓
generic identity executor
        ↓
duplicate evaluator
```

---

## 2. Sjóvá – raunverulegt duplicate-gat fannst

Sjóvá-skjal, dagsett 01.04.2026, 89.152 kr., kom fyrir tvisvar.

Read-only diagnostic staðfesti:

- document `384` / receipt `88` / voucher `48` – bókað
- document `385` / receipt `90` – óbókað á þeim tíma
- `receiptNumber = null` á báðum
- `fileHash` ólíkt
- sami söluaðili
- sama dagsetning
- sama upphæð
- sömu 12 bókunarlínur

Diagnostic sýndi að núverandi booking guard var með `merchant/date/amount` duplicate-vörnina inni í:

```ts
if (document.receiptNumber) {
```

Þar með var vörnin óvirk þegar `receiptNumber` vantaði.

Þetta var **almennt bug**, ekki Sjóvá-sérregla.

---

## 3. Sjóvá voucher 51 – stýrð rollback-viðgerð

Áður en viðgerð var framkvæmd kom í ljós að sama Sjóvá-skjalið hafði verið bókað tvisvar:

- voucher **48** – rétta eldri bókunin
- voucher **51** – rangt tvírit

Read-only rollback readiness staðfesti:

- 12 posted `ReceiptEntry`
- 12 duplicate `InsightFact`
- 28 duplicate `DocumentEntityLink`
- engin `FinancialEvent` tenging
- engin reconciliation
- voucher reservation `51` til staðar
- company `nextVoucherNumber = 52`

Stýrð viðgerð var keyrð.

Niðurstaða:

- voucher **48** hélt sér óbreyttur og gildur
- voucher **51** var retired/ógilt sem tvírit
- 12 `ReceiptEntry` línur nr. 51 fjarlægðar
- 12 duplicate `InsightFact` fjarlægð
- 28 duplicate `DocumentEntityLink` fjarlægð
- voucher reservation **51** varðveitt svo númerið verði ekki endurnýtt
- audit event **1591** skráði rollback
- document `385`:
  - `voucherNumber = null`
  - disposition `DUPLICATE_RESOLVED`
  - duplicateOfDocumentId `384`
  - duplicateOfVoucher `48`
- receipt `90`:
  - `NOT_BOOKED`
  - 0 posted entry rows
- company `nextVoucherNumber` áfram `52`

---

## 4. Duplicate-vörn lagfærð

Commit:

- `32f65d0` – **Guard duplicates without receipt numbers**

Lagfæringin færði `merchant + date + amount` vörnin út fyrir `if (document.receiptNumber)`.

Ný regla:

> Skortur á reiknings-/kvittunarnúmeri má aldrei slökkva á öðrum sjálfstæðum duplicate-sönnunargögnum.

ReceiptNumber/obligation identity-leiðin helst sér og óbreytt.

Commit varð **Ready í Production**.

---

## 5. Regression-próf fyrir null receiptNumber

Nýtt contract/regression-próf var sett inn fyrir buggið.

Prófið staðfestir:

1. `merchant/date/amount` duplicate guard keyrir þó `receiptNumber` vanti.
2. receiptNumber/obligation-instance evaluation helst sér og kemur síðar í flæðinu.

Fyrsta útgáfa prófsins var með of þröngt regex og féll ranglega. Prófið var lagað.

Lokaútkoma:

```text
tests 2
pass 2
fail 0
```

og `npx tsc --noEmit` hreint.

Commit:

- `8baa174` – **Add duplicate guard regression coverage**

Commit varð **Ready í Production**.

---

## 6. Yfirferð á biðröð – möguleg tvírit

Í bunka óunninna skjala fundust nokkrar mjög sterkar samstæður.

### Krónan Fitjabraut – 04.09.2026 – 6.825 kr.

Tvö skjöl sýndu:

- sama söluaðila
- sömu dagsetningu
- sömu upphæð
- sama Visa-ending `8119`
- sama kvittunarnúmer `0000021165000105857`
- sama sýnilega frumskjal

Niðurstaða:

- sama document instance / tvírit
- notandinn hefur ákveðið að bóka ekki þessa kassastrimla
- þeim verður því eytt frekar en notað sem booking-próf

### Festa – 01.06.2026 – 251.590 kr.

Tvö skjöl voru borin saman og reyndust vera sama occurrence:

- gjalddagi `01.06.2026`
- gjaldagi `21 af 480`
- innheimtubréf `338379`
- tilvísun `109815`
- krafa `294755`
- sama sundurliðun
- sama heild `251.590 kr.`

Niðurstaða:

- `SAME_INSTANCE`
- annað eintakið á að eyðast
- hitt varðveitt til síðar

Líkleg skýring er að tvíritið kom inn fyrr í þróunarferlinu þegar duplicate-varnir voru veikari.

### Sýslumaður – 02.07.2026 – 22.160 kr.

Tvö eins listaatriði fundust. Þau voru ekki fullsamanborin í kvöld og bíða næstu yfirferðar.

---

## 7. Skjöl sem voru bókuð í röð í kvöld

Til að halda réttri skjalaröð og komast að duplicate-prófun voru eldri skjöl afgreidd.

### Festa – 01.04.2026 – 248.211 kr.

- voucher **53**
- lán `0142-338379`
- occurrence **19/480**
- bókun stemmdi
- rétt að fara í gegn sem annað occurrence

### Ergo – 02.04.2026 – 90.000 kr.

- voucher **54**
- lán `104907`
- sérstök innborgun á höfuðstól
- ekki sama occurrence og mánaðarleg afborgun

### Ergo – 03.04.2026 – 45.126 kr.

- voucher **55**
- lán `104907`
- krafa `24683`
- occurrence **15/24**

### Ergo – 03.04.2026 – 75.574 kr.

- voucher **56**
- lán `103533`
- endurtekin reference/krafa `24345`
- occurrence **16/84**

Þetta var mikilvægt acceptance-próf: sama canonical skuldbinding/reference má koma aftur, en mismunandi staðfest occurrence á að vera bókanlegt.

---

## 8. Skjalaröð – hönnunarregla staðfest

Skjalaröð er viljandi hluti af bókunarferlinu, ekki galli.

Regla:

- eldri skjöl almennt fyrst
- skjöl sama almanaksdag mega fara í hvaða röð sem er
- skjöl í `NEEDS_ATTENTION` / „Þarf skoðun“ mega ekki blokka áframhaldandi vinnu
- ekki á að búa til almenna leið til að hoppa fram fyrir bókunarröð

Aftur á móti eiga diagnostic/read-only verkfæri að geta skoðað hvaða skjal sem er án þess að breyta bókunarstöðu eða röð.

---

## 9. Staða í Production í lok dags

Staðfest Ready í Production:

- `4db165b` – Extract installment occurrence discovery provider
- `32f65d0` – Guard duplicates without receipt numbers
- `8baa174` – Add duplicate guard regression coverage

Generic identity executor commit `2af1ae3` er hluti af núverandi main-sögu.

---

## 10. Næstu skref 8. október

Forgangsröð:

1. Staðfesta hreina git-stöðu og hreinsa/eða geyma one-off Sjóvá diagnostic/repair skriptur utan main.
2. Halda áfram með **generic occurrence-provider/orchestration generalization**.
3. Loan/installment á að verða einn provider meðal fleiri, ekki sjálft orchestration-lagið.
4. Ekki veikja:
   - fail-closed duplicate-vörn
   - authoritative source evidence
   - canonical obligation binding
   - SAME_INSTANCE / DISTINCT_INSTANCE regluna
   - skjalaröð
5. Skoða pending-vs-pending duplicate-vörn sem mögulega næstu styrkingu; kvöldið sýndi að tvö óbókuð eintök geta lifað hlið við hlið þar til annað er bókað.
6. Skoða Sýslumann 02.07.2026 / 22.160 kr. parið ef það er enn í biðröð.

---

## Endapunktur dagsins

GLÖGGT er í sterkari stöðu en í upphafi dags:

- generic identity execution er aðskilið
- occurrence discovery provider er aðskilinn
- production duplicate-gat fyrir `receiptNumber = null` fannst og var lagað
- rangri tvíbókun var snúið til baka með fullum audit-rekjanleika
- voucher-númer var ekki endurnýtt
- regression-próf verndar lagfæringuna
- distinct recurring obligations héldu áfram að virka rétt
- skjalaröð var staðfest sem viljandi invariant

**Næsti arkitektúrþráður:** generic occurrence orchestration, með sama stranga evidence/fail-closed grunni.
