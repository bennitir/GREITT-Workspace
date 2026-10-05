GLÖGGT – FinancialReconciliation Gagnaþekja adapter/UI v2
5. október 2026

FLAT OVERLAY
------------
Afþjappa beint yfir C:\GLÖGGT.
ZIP-ið byrjar á app/, lib/ og docs/. Engin root/ millimappa.

HVAÐ ER TENGT
-------------
- Sameiginlegt Gagnaþekja-spjald á greiðslukorti.
- Sama spjald á bankafstemmingu fyrir dýpri diagnostics.
- Card adapter notar PaymentCardTransaction + reviewed AiDetectedDocument + confirmed CARD_TO_REVIEWED_DOCUMENT.
- Bank adapter notar authoritative diagnostic snapshot og MANY_TO_MANY; engin fölsk 1:1 regla.
- is/en/pl/sr textar.
- Engin Prisma migration.

POLICY
------
Núverandi UI notar INFORMATIONAL coverage. REQUIRED/EXCLUDED er ekki giskað út frá fyrirtæki,
kennitalu eða nafni. Explicit persisted policy kemur síðar.

PRÓF EFTIR OVERLAY
------------------
cd C:\GLÖGGT
npx tsc --noEmit

npx tsx --test `
  lib/financial-reconciliation/coverage.test.ts `
  lib/financial-reconciliation/coverage-adapters.test.ts `
  lib/financial-reconciliation/card-reviewed-document-provider.test.ts `
  lib/financial-reconciliation/card-reviewed-document-confirmation.test.ts

VÆNT
----
Coverage core + adapters: 11 próf.
Card provider/confirmation: núverandi 14 próf úr síðasta staðfesta áfanga.
Fullt tsc þarf að vera hreint áður en raunpróf í vafra er tekið.
