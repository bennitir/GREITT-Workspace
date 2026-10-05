GLÖGGT V16 – handvirk kortaafstemming þegar deterministic leit finnur ekki öruggt mót
2026-10-05

Markmið
- Kortafærsla má ekki festast í „Engin örugg tillaga“.
- Notandi með reconciliation-heimild getur opnað „Afstemma handvirkt“ og valið yfirfarið undirskjal sjálfur, líkt og í bankafstemmingu.

Hegðun
- Sjálfgefið: sama absolute upphæð, ±30 dagar.
- Hægt að leita eftir seljanda/alias, kennitölu, reikningsnúmeri, fylgiskjali eða undirskjali.
- Hægt að víkka í allar upphæðir og ±90 daga/allt til skoðunar.
- Raðar exact amount + exact date fremst, síðan líklegum mótaðila og dagamun.
- Handvirk staðfesting getur tekið yfir þar sem sjálfvirki providerinn hafnaði documentType/identity, en öryggisreglur haldast:
  * exact amount fyrir staðfestingu
  * reviewed document
  * canonical local date + merchant
  * ekki PRIMARY FinancialEvent
  * ekki þegar staðfest reconciliation-owner
  * ekki transaction sem er flokkuð PERSONAL/INTERNAL_TRANSFER/NON_DOCUMENT
- Staðfesting notar núverandi confirmCardReviewedDocumentReconciliation, audit og company-local learning.
- Engin Prisma migration.

Próf/athugun
1. npx tsc --noEmit
2. npx tsx --test `
     lib/financial-reconciliation/card-reviewed-document-provider.test.ts `
     lib/financial-reconciliation/card-reviewed-document-confirmation.test.ts
3. Opna Gullkort og Pítan 20.05.2026 / 4.645 kr.
4. Smella „Afstemma handvirkt“.
5. Pítan-fylgiskjal með sömu upphæð og dagsetningu á að koma efst. Ef hard-block er til staðar sýnir síðan ástæðuna í stað þess að leyfa óörugga staðfestingu.
