GLÖGGT v1.13j — Innsýn fact display: property, utilities and vehicles

- Presentation-only translations for standardized fact labels.
- Adds property/municipal fee, utility/electricity and vehicle labels for is/en/pl/sr.
- Adds safe pattern translations for HS utility lines while preserving supplier names.
- Fixes the known mixed-language phrase "2. dagur næsta mánaðar" in the standardized due-date label.
- Does not modify stored InsightFact values, source documents or database data.
- No Prisma migration.

After copying over C:\GLÖGGT run:
  npx tsc --noEmit
