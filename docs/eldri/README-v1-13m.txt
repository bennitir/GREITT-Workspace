GLÖGGT v1.13m – Innsýn standardized fact values + residual labels

Copy the contents over C:\GLÖGGT and run:
  npx tsc --noEmit

Changes:
- Adds presentation-only translation for recognized standardized fact values.
- Adds Icelandic month-name presentation for standardized periods.
- Translates known payment/fuel/property/loan values and fixed interest/date-range phrases.
- Adds residual standardized loan/tax/pension/mileage fact labels found in the latest Innsýn test.
- Adds day units to the unit presentation layer.
- Does NOT mutate InsightFact, source text, organization/person names, addresses, identifiers, or booked accounting data.
- No Prisma migration.
