GLÖGGT mixed-use bank classification V5

Flat overlay yfir C:\GLÖGGT.

Keyra eftir overlay:
  npx prisma validate
  npx prisma generate
  npx prisma migrate deploy
  npx prisma generate
  npx tsc --noEmit

Markviss próf:
  npx tsx --test `
    lib/financial-reconciliation/source-classification.test.ts `
    lib/financial-reconciliation/coverage.test.ts `
    lib/financial-reconciliation/coverage-adapters.test.ts `
    lib/financial-reconciliation/company-policy.test.ts

Engin sjálfvirk PERSONAL flokkun. PERSONAL krefst staðfests mixed-use company context.
