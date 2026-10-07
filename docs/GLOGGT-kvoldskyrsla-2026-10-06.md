# GLÖGGT – kvöldstaða 6. október 2026

Dagurinn skilaði mjög miklu. Við byrjuðum á áframhaldandi kerfisúttektinni og enduðum á að staðfesta í Production eina af mikilvægustu almennu reglunum í duplicate-vörninni: **sama skuldbinding má eiga mörg mismunandi greiðslutilvik, en sama greiðslutilvik má ekki bókast tvisvar.**

## Stóri áfanginn – Ergo 103533 / 24345

Gamla bókaða skjalið, document 274 / fylgiskjal 6, reyndist vera **13 af 84**. Nýja skjalið, document 275, var **14 af 84**. Bæði tengdust sama canonical obligation, `entityId 1`.

Vandinn var ekki duplicate-samanburðurinn sjálfur. Hann var í occurrence-greiningunni: gamla yfirfarna summary-ið sagði **„Greiðsla 13 af 84“**, en parserinn þekkti aðeins sértæk orð eins og „gjalddagi“, „afborgun“ og „installment“.

Við breyttum því þannig að occurrence extraction les nú almennt formið **N af M / N of M**, án vendor- eða label-lista. Obligation-gating er áfram aðskilið og fail-closed.

**85/85 próf græn** og TypeScript hreint.

Production identity-preparation staðfesti:

- **274 → 13/84 → CURRENT_CONFIRMED**
- **275 → 14/84 → CURRENT_CONFIRMED**

Duplicate-samanburður:

```text
comparison: DISTINCT_INSTANCE
blockingReasons: []
blocked: false
```

Breytingin var commit-uð sem:

**`5527333 – Generalize reviewed occurrence evidence`**

og fór í Production.

## Production-bókun document 275

**Fylgiskjal 22 – 03.02.2026 – 75.412 kr.**

- `2220` Debet 39.385
- `5110` Debet 35.897
- `4980` Debet 130
- `1510` Kredit 75.412

Read-only acceptance-check staðfesti að gamla fylgiskjal 6 hélst óbreytt, nýja fylgiskjal 22 er bókað, bæði hafa staðfest document-instance identity og bæði vísa í sama canonical obligation.

Audit-röðin:

- document 275: **1550 / 1551**
- document 274: **1552 / 1553**

Þetta er því ekki lengur bara unit-test heldur **raunverulegt Production acceptance-próf**.

## Framvinda stóra prófsins / úttektarlistans

| Liður | Staða | Athugasemd |
|---|---|---|
| 1. Heimildir / tenant isolation | ✅ Lokið | Phase 1A |
| 2. Double-posting / idempotency | ✅ Lokið | Phase 1B |
| 3. Review/content revision + stale derived truth | ✅ Lokið | Phase 1C, `cd9a55a`, Production |
| 4. Duplicate authority / obligation + occurrence | 🟡 Vel á veg komið | Production acceptance tókst í dag |
| 5. Transaction boundaries + performance | ⏳ Eftir | m.a. Banki O(N×M), endurteknar DB-lestrar |
| 6. Ledger lineage + money/VSK | ⏳ Eftir | m.a. child-document lineage |
| 7. Leit / retrieval | ⏳ Eftir | |
| 8. UX / operational blockers | ⏳ Eftir | m.a. production error presentation |
| 9. Legacy cleanup | ⏳ Eftir | sérreglur, regex og eldri arkitektúr |

Við erum því **búin með fyrstu þrjá liði og komin langt inn í lið 4**.

## Nýtt acceptance-dæmi – Ergo 104907 / 24683

Seint í kvöld kom upp annað mikilvægt tilvik með Ergo-láni **104907**, kröfu **24683**.

Þar eru **tvö mismunandi frumskjöl**, ekki tvö eintök af sama PDF. Bæði vísa að því er virðist í sama occurrence, en með mismunandi fjárhæðum.

Bankagögn sýna raunverulegar Ergo-greiðslur yfir tímann, m.a.:

- **46.147 kr.** fyrr á árinu
- **45.188 kr.** í mars

Mikilvæg viðbótarupplýsing: öll skjöl sem lágu í bankanum voru sótt inn, en hitt skjalið virðist hafa legið þar án þess að krafa hafi komið til greiðslu.

Arkitektúrregla:

> **Tilvist skjals ≠ sönnun um virka kröfu eða greiðslu.**

Mörg source documents geta vísað í sama canonical occurrence. Þau geta jafnvel stangast á í monetary facts. Þá þarf GLÖGGT að varðveita skjölin, greina conflict/superseded stöðu og nota greiðslukröfu/bankafærslu sem sterkari sönnun um hvað raunverulega varð greitt.

## Það sem er eftir innan liðar 4

Við eigum enn legacy-sérhæfingu í discovery-laginu sem við viljum fjarlægja, m.a.:

- `loanIdentifierMatchesRepeatedReference()`
- label-sértæk obligation-reference greining
- legacy regex-reglur sem eiga ekki heima í almenna kjarnanum

Endanlega líkanið á að vera:

> **canonical obligation → occurrence identity → source evidence**

Festa, Ergo og önnur raunskjöl eru acceptance-próf fyrir vélina, ekki reglur inni í henni.

Acceptance-vörður:

- **sama obligation + 13/84 vs 14/84 → DISTINCT**
- **sama obligation + 14/84 aftur → SAME / blokka**
- **ófullnægjandi obligation/occurrence evidence → fail closed**

## Áætlun fyrir 7. október 2026

Fyrri lotan verður frá morgni til um **12:00**.

Byrjunarpunktur:

1. Festa stöðuna frá kvöldinu.
2. Skoða núverandi obligation/reference discovery.
3. Byrja að fjarlægja legacy-sérreglur með prófum fyrir hvert skref.
4. Halda Festa og Ergo sem acceptance-prófum, ekki runtime-sérreglum.

Markmiðið fyrir hádegisstoppið er að hafa almenna obligation/occurrence discovery-refactorinn annaðhvort kláraðan eða kominn í mjög skýran checkpoint með öllum acceptance-prófum grænum.

Seinni lota verður eftir kvöldmat.

Ef liður 4 er þá lokaður förum við beint í:

## Lið 5 – Transaction boundaries + performance

Helstu viðfangsefni:

- Banki O(N×M) candidate-leit
- endurteknar DB-lestrar
- overlapping queries á `/banki/[id]/afstemming`
- transaction boundaries
- file/storage I/O innan bókhalds-transactiona

## Kvöldcheckpoint

- Production er heil.
- Commit `5527333` er lifandi í Production.
- Occurrence extraction er almennari og label-agnostic fyrir `N af M / N of M`.
- 85/85 próf græn.
- Ergo 103533 / 24345 production acceptance tókst.
- Document 274 = 13/84 / fylgiskjal 6.
- Document 275 = 14/84 / fylgiskjal 22.
- Sama canonical obligation, mismunandi occurrence → `DISTINCT_INSTANCE`.
- Duplicate-vörn leyfði rétta bókun.
- Sama occurrence á áfram að blokka sem `SAME_INSTANCE`.
- Næsti arkitektúrpúnktur er skýr: almennivæða obligation/reference discovery og fjarlægja legacy-sérreglur án þess að veikja fail-closed vörnina.

**Næsti vinnupunktur:** halda áfram í lið 4 – generic obligation/occurrence discovery refactor.
