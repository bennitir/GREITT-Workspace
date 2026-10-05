GLÖGGT V12 – pg interactive transaction serial read fix – 2026-10-05

Fixes the PaymentCardPage console deprecation warning:
  Calling client.query() when the client is already executing a query is deprecated.

Cause:
  getCardReviewedDocumentCandidates() used Promise.all() for three tx.* reads inside
  one interactive Prisma transaction. @prisma/adapter-pg backs that transaction with
  one checked-out pg client, so concurrent tx queries overlapped on that client.

Change:
  Keep those transaction-scoped reads sequential with await. No domain/matching,
  coverage, classification, or persistence semantics change. No Prisma migration.

After overlay:
  npx tsc --noEmit
  then refresh/restart dev server if Turbopack still has the previous module loaded.
