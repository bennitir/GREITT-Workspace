GLÖGGT MIXED-USE BANK + CARD TILTEKT V7 CUMULATIVE - 2026-10-05

This is a flat cumulative overlay. It includes the V5 bank classification foundation and the V6 payment-card integration.

Important dependencies included:
- lib/financial-reconciliation/source-classification.ts
- lib/i18n/financial-source-classification.ts
- FinancialSourceClassification Prisma model
- migration 20261005120500_add_financial_source_classification
- bank classification UI/actions
- card classification UI/actions
- coverage adapter integration

Apply directly over C:\GLÖGGT. No root/ wrapper directory.

Then run:
  npx prisma validate
  npx prisma generate
  npx prisma migrate deploy
  npx prisma generate
  npx tsc --noEmit

Then run the focused tests from the handoff message.
