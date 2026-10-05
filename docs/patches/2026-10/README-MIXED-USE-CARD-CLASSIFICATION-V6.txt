GLÖGGT Mixed-use Card Classification V6 – 2026-10-05

Flat overlay yfir C:\GLÖGGT.
Engin ný Prisma migration.

Eftir overlay:
  npx tsc --noEmit
  npx tsx --test `
    lib/financial-reconciliation/source-classification.test.ts `
    lib/financial-reconciliation/company-policy.test.ts `
    lib/financial-reconciliation/coverage.test.ts `
    lib/financial-reconciliation/coverage-adapters.test.ts `
    lib/financial-reconciliation/card-reviewed-document-provider.test.ts `
    lib/financial-reconciliation/card-reviewed-document-confirmation.test.ts

Raunpróf:
1. Opna mixed-use greiðslukort.
2. Merkja augljósa persónulega færslu sem "Persónulegt / ekki rekstur".
3. Hún á að hverfa úr "Í afstemmingu" og birtast undir "Persónulegt".
4. Coverage á að endurreiknast; færslan telst EXCLUDED úr fylgiskjalaþekju.
5. Clear flokkun á að færa færsluna aftur í virkan lista.
