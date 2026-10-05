GLÖGGT – fjöldaflokkun kortafærslna V9 – 5. október 2026

Tilgangur
- Draga úr bið þegar margar augljósar kortafærslur eru flokkaðar.
- Notandi hakar við margar línur og vistar eina sameiginlega flokkun.
- Ein server-aðgerð, ein DB-transaction og ein endurhleðsla/revalidation fyrir allan hópinn.

Hegðun
- Hægt er að velja allt að 200 sýnilegar óafstemmdar kortafærslur í einu.
- Fjöldaaðgerðir: Rekstur, Persónulegt, Innri millifærsla, Ekki fylgiskjalafærsla, Þarf yfirferð.
- Persónulegt birtist aðeins þegar company-policy leyfir mixed-use.
- Afstemmdar færslur eru ekki valanlegar í fjöldaflokkun.
- AuditEvent er skrifað fyrir hverja raunverulega breytta færslu.
- Frumkortafærslur eru aldrei breyttar eða eyddar.

Engin Prisma migration.

Próf eftir overlay:
  npx tsc --noEmit

  npx tsx --test `
    lib/financial-reconciliation/source-classification.test.ts `
    lib/financial-reconciliation/company-policy.test.ts `
    lib/financial-reconciliation/coverage.test.ts `
    lib/financial-reconciliation/coverage-adapters.test.ts `
    lib/financial-reconciliation/card-reviewed-document-provider.test.ts `
    lib/financial-reconciliation/card-reviewed-document-confirmation.test.ts
