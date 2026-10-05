GLÖGGT – Company reconciliation policy V3 – 05.10.2026

Þessi patch byggir ofan á Gagnaþekju V1 + Adapter/UI V2.

Nýtt:
- Fyrirtækjaspjald skilgreinir explicit tax identity + business/personal use.
- Company policy resolver velur REQUIRED / INFORMATIONAL / EXCLUDED fail-closed.
- Kortafstemming og bankafstemming lesa sama company policy.
- Breytingar eru audit-loggaðar.
- MIXED_USE gefur contract fyrir næsta lag: Persónulegt / ekki rekstur -> EXCLUDED.

Mikilvægt:
- Engin kennitala eða fyrirtækjanafn er hardkóðað.
- Existing companies fá UNCONFIRMED og halda INFORMATIONAL þar til samhengi er staðfest.
- Migration þarf að keyra áður en tsc.

Keyra eftir overlay:

cd C:\GLÖGGT
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx prisma generate
npx tsc --noEmit

npx tsx --test `
  lib/financial-reconciliation/company-policy.test.ts `
  lib/financial-reconciliation/coverage.test.ts `
  lib/financial-reconciliation/coverage-adapters.test.ts `
  lib/financial-reconciliation/card-reviewed-document-provider.test.ts `
  lib/financial-reconciliation/card-reviewed-document-confirmation.test.ts

Raunpróf:
1. Fyrirtækjaspjald -> Rekstrarsamhengi og afstemming.
2. Staðfesta einstaklingsrekstur + MIXED_USE hjá viðeigandi einstaklingsrekstri.
3. Gullkort/banki á áfram að sýna Upplýsandi þekju.
4. Staðfesta LEGAL_ENTITY hjá venjulegu fyrirtæki.
5. Coverage þar á að sýna Skyldubundna þekju.
