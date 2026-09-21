GLÖGGT v1.13f – Innsýn display localization
- Uses current app/innsyn/page.tsx from 2026-09-11 21:46 upload.
- Localizes standard entity/status/fact labels and units only at display time.
- Does not alter stored InsightEntity/InsightFact/source-document data.
- No Prisma migration.
- Run: npx tsc --noEmit
