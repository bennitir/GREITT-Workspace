GLÖGGT – TypeScript compatibility fix, 5. október 2026

Fixes only compile compatibility found after company reconciliation policy migration:
1. coverage.ts: replace BigInt literals (10n/0n) with BigInt(10)/BigInt(0) for current tsconfig target.
2. coverage-adapters.test.ts: normalize optional confirmed boolean to boolean|null with ?? null.

No schema or behavior change. No Prisma migration. Flat overlay: copy lib/ directly over C:\\GLÖGGT\lib.
