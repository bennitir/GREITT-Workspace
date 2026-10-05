# GLÖGGT – Festa / document-instance checkpoint
**Dagsetning:** 2. október 2026

## Markmið
Laga false-positive duplicate greiningu fyrir endurtekin lánaskjöl án Festa/Landsbankinn sérkóða.

Dæmið sem má ekki gleymast:
- `Innheimtubréf númer: 338379` er stöðugt auðkenni skuldbindingar/láns.
- Það tengist láninu `0142-338379`.
- `16/480` og `17/480` eru tvær mismunandi afborganir/document instances.
- Sama nákvæma afborgun hlaðin inn tvisvar á hins vegar áfram að blokka sem duplicate.

## Fastar reglur
- SAME_INSTANCE: sama company + obligation + installment total + sequence.
- DISTINCT_INSTANCE: sama company + obligation + sama installment total, en mismunandi sequence.
- Annars: INSUFFICIENT_EVIDENCE / fail closed.
- Dagsetning, upphæð, documentId eða endurtekið reference eru ekki ein og sér instance-lyklar.
- Breytt installment-total er óvissa og má ekki sjálfkrafa veita undanþágu.
- DISTINCT má aðeins fjarlægja obligation-reference duplicate ástæðuna fyrir viðkomandi pari.
- Aðrar sjálfstæðar duplicate ástæður, t.d. fingerprint, merchant/date/amount o.fl., verða að lifa áfram.
- SAME_INSTANCE vinnur alltaf og blokkar.
- PROPOSED identity veitir enga duplicate undanþágu.
- Confirmation/provenance verður að koma úr varðveittu frumskjali.

## Komið í production
- `487a301` – pure versioned document instance identity comparison.
- `b2060e5` – pure document duplicate reason evaluation.
- `1579835` – versioned document instance envelope state.
- `d680cf0` – document instance identity service + Prisma/auth/audit adapter.
- `489c0eb` – trusted document instance evidence verifier.
- `8b079be` – trusted original document artifact loader.
- `14b99ef` – PostgreSQL advisory locking verified; production Ready.

## PostgreSQL integration sönnun
Sérstakur Supabase test-gagnagrunnur var stofnaður: `gloggt-integration-test`.

Öll 6 raunverulegu PostgreSQL integration-prófin urðu græn:
1. Sama fyrirtæki serialiserast með advisory lock.
2. Mismunandi fyrirtæki blokka ekki hvort annað.
3. Audit + metadata rollback-a atomic.
4. Tvö eins concurrent confirm skila einu audit + idempotent replay.
5. Tvö mismunandi concurrent confirm geta ekki bæði neytt sömu gömlu revision.
6. Advisory-lock namespace er stöðugt og nonzero.

Við integration-prófið fannst raunverulegt Prisma/Postgres atriði:
`pg_advisory_xact_lock()` skilar `void`, sem Prisma gat ekki deserialize-að.
Production-kóðinn var lagaður til að halda sama transaction-scoped advisory lock en skila `1::integer` til Prisma.

## Original-artifact / evidence
- Supabase bucket: `fylgiskjol`.
- `Receipt.fileHash` er content identity.
- Loader les aðeins tenant-scoped company/receipt/document.
- Storage-path verður að vera innan company-prefix.
- Raunveruleg downloaded bytes eru SHA256-staðfest gegn `fileHash`.
- Legacy local `filePath` er ekki treyst fyrir identity confirmation.
- PDF texti er deterministic lesinn; evidence verður að finnast á réttri blaðsíðu ásamt obligation reference.
- Breytt skrá, röng síða, stale binding, röng digest eða mutable artifact fail-a closed.

## Mjög mikilvægt: Festa er EKKI enn end-to-end lokað
Undirliggjandi vél er komin og prófuð, en production workflowið þarf enn wiring.

### Næstu skref – í þessari röð
1. **Duplicate candidate reevaluation**
   - Safna öllum relevant candidates, ekki `take:100`.
   - Union: receiptNumber + canonical obligation + fingerprint + merchant/date/amount + current duplicateOfDocument.
   - Meta allar duplicate ástæður fyrir hvert par.
   - Confirmed DISTINCT má aðeins fjarlægja obligation-reference reason.

2. **Production confirm/invalidate wiring**
   - Tengja server action/workflow við authoritative document-instance service.
   - Client má ekki senda authoritative company/user/identity metadata.
   - Reverify evidence og binding eftir company lock.

3. **Sameiginleg læsing á öllum duplicate-relevant writers**
   - Ingestion/booking/binding/duplicate-relevant breytingar sem geta keppt þurfa sama company advisory lock.
   - Enginn legacy generic duplicate shortcut má fara framhjá nýja reason-matinu.

4. **Atomic duplicate reevaluation**
   - Eftir identity confirmation þarf duplicate-niðurstaða að endurmetast inni í sömu öruggu transaction-röð áður en workflow heldur áfram.

5. **Festa end-to-end acceptance test**
   - Nota raunveruleg Festa/Landsbankinn skjöl.
   - Staðfesta að 16/480 og 17/480 fari bæði í gegn sem DISTINCT_INSTANCE.
   - Hlaða sömu afborgun aftur inn og staðfesta að hún blokki sem SAME_INSTANCE/duplicate.
   - Staðfesta að sjálfstæð fingerprint eða önnur duplicate ástæða blokki áfram þegar hún á við.
   - Staðfesta audit trail og að booking fields breytist ekki við identity confirmation.

## Hvenær má segja „Festa málið er komið í lag“?
Aðeins þegar skref 1–5 hér að ofan eru komin í production og raunverulega Festa acceptance-prófið er grænt.

## Næsti byrjunarpunktur
**Byrja á duplicate candidate reevaluation + production wiring.**
Ekki fara aftur í hönnun identity/envelope/evidence/advisory-lock nema nýtt próf sýni raunverulega bilun þar.
