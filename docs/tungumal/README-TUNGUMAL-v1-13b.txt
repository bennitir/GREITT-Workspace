GLÖGGT v1.13b – Óunnin fylgiskjöl + tímamælistexti

Byggt ofan á v1.13a.

Breytt:
- app/fylgiskjol/page.tsx: Óunnin fylgiskjöl notar nú sameiginlegan UI-tungumálagrunn.
- lib/i18n/ui.ts: strengir fyrir Óunnin fylgiskjöl og virkan tímamæli á is/en/pl/sr.
- components/ServiceTimeTracker.tsx: sýnilegur texti tímamælis fylgir viðmótstungumáli; mælingarlogík óbreytt.
- app/actions/serviceTimeActions.ts: skilar interfaceLanguage með núverandi tímamælisstillingum.

Engin Prisma migration.
Eftir uppsetningu: npx tsc --noEmit
