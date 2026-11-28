# GLÖGGT – occurrence orchestration (8. október 2026)

## Umfang þessarar breytingar

Þetta er afmarkaður refactor á því hvernig document-instance identity-undirbúningur
velur discovery-provider. Núverandi `PROPOSE → audit → persist → CONFIRM` executor
og læsing fyrirtækis (company-scoped advisory lock) eru **óbreytt**.

Ný hreint prófanleg eining:
`lib/receipts/document-instance-occurrence-orchestration.ts`

Hún gerir eftirfarandi:

1. Fyrir `CONFIRMED` er discovery ekki endurtekið.
2. Fyrir `PROPOSED` er fyrirliggjandi tillaga staðfest áfram; hún er ekki yfirskrifuð.
3. Fyrir `INVALIDATED` eða skemmd metadata er fail-closed.
4. Þegar engin tillaga er fyrir hendi er nákvæmlega einn viðeigandi provider valinn.
5. Enginn provider → `NOT_APPLICABLE`; fleiri en einn → `AMBIGUOUS_OCCURRENCE_PROVIDER`.
6. Discovery án fullnægjandi gagna → `UNAVAILABLE`; engin tillaga/bókun.
7. Uppgötvun skilar aðeins candidate + evidence; staðfesting er áfram í
   upprunalegum identity executor og trusted evidence verifier.

Núverandi provider:
`discoverLoanInstallmentDocumentInstanceIdentity` í
`lib/receipts/document-instance-booking.ts`.

## Það sem er viljandi **ekki** breytt

- Bókun kallar aðeins á þennan undirbúning þegar `receiptNumber` er til staðar.
- Aðeins er leitað að áður samþykktum skjölum með **sama** `receiptNumber` innan sama fyrirtækis.
- Gamla loan legacy-binding bootstrap er óbreytt, þar með talin
  `loanIdentifierMatchesRepeatedReference` suffix-reglan.
- Venjuleg merchant/date/amount tvítekningarvörn (þ.m.t. Sjóvá án receiptNumber)
  er óbreytt.
- Engin Prisma/schema/migration breyting, engin bókunarlínubreyting og engin
  ný sjálfvirk flokkun annarra skuldbindinga.

**Takmörkun:** Þetta einangrar provider-stýringu en leysir ekki enn almennan
obligation-discovery fyrir kröfur, tryggingar eða önnur skjöl. Það verður
sérstakur síðari áfangi og krefst acceptance-prófa.

## Prófanir

Ný próf:
`lib/receipts/document-instance-occurrence-orchestration.test.ts`

Prófað í einangruðu umhverfi: 8 ný tilvik. Jafnframt keyrð 104 pure
identity/duplicate próf (þau átta meðtalin), öll stóðust.

Í fullu verkefni, eftir innsetningu, þarf einnig:

```powershell
npx tsc --noEmit
npx tsx --test lib/receipts/document-instance-*.test.ts lib/receipts/document-duplicate-reasons.test.ts
```

Ef `tsx` er ekki sett upp í verkefninu, nota fyrirliggjandi prófunarskipun.
Ekki framkvæma production deploy fyrr en TypeScript, prófanir og git diff hafa
verið yfirfarin. Acceptance í Production (Festa/Ergo/Sjóvá) er ekki framkvæmt
með þessum plástri einum.
