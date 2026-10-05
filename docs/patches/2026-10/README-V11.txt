GLÖGGT — Sameiginlegt reconciliation read/diagnostic V11 — 05.10.2026

Markmið
- Sameina kosti banka- og kortaafstemmingar í sameiginlegan read/diagnostic kjarna.
- Halda source-specific reglum aðskildum (kort exact-date dominance; banki FinancialEvent/payment/due-date semantics).

Helstu breytingar
- Sameiginlegt canonical AiDetectedDocument read-model fyrir bankafærslur og kortafærslur.
- Receipt er aðeins gámur; parent fallback er aðeins leyft þegar Receipt hefur nákvæmlega eitt detected document.
- Company-local canonical ORGANIZATION/ISSUER alias-þekking er endurnýtt í merchant/party matching.
- Duplicate/disposed skjöl og skjöl sem staðfest reconciliation á þegar eru varin gegn endurnotkun.
- Sameiginlegt read-only rejection diagnostic lag sýnir af hverju óleyst mót féll út:
  * engin sama upphæð
  * dagsetning utan glugga
  * skjal óhæft/eignað öðru flæði
  * identity/canonical alias ekki leyst
- Kortasíðan fær diagnostic yfirlit og skýringar á óleystum færslum.
- Bankinn fær sama canonical document reading og alias/ownership guards og kortið.

Engin Prisma migration fylgir V11.

Mælt local validation:
  npx tsc --noEmit

  npx tsx --test `
    lib/financial-reconciliation/reviewed-document-read-model.test.ts `
    lib/financial-reconciliation/reviewed-document-match-diagnostics.test.ts `
    lib/financial-reconciliation/reviewed-document-provider.test.ts `
    lib/financial-reconciliation/card-reviewed-document-provider.test.ts `
    lib/financial-reconciliation/card-reviewed-document-confirmation.test.ts `
    lib/financial-reconciliation/source-classification.test.ts `
    lib/financial-reconciliation/company-policy.test.ts `
    lib/financial-reconciliation/coverage.test.ts `
    lib/financial-reconciliation/coverage-adapters.test.ts

Local isolated validation during patch build:
- strict TypeScript compile on shared pure core: clean
- changed service/UI/i18n transpile check: clean
- provider/read-model/diagnostic runtime tests: 31/31 passed
