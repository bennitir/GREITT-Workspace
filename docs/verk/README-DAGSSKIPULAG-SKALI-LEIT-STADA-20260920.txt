GLÖGGT – Dagskipulag skali/leit/staða – FLAT hotfix 20.09.2026

Þessi ZIP er með project-slóðir beint í rót svo afþjöppun yfir C:\GLÖGGT uppfærir réttar skrár.

Breyttar skrár:
- app/verk/Work10Dashboard.tsx
- lib/i18n/work10.ts

Engin Prisma-breyting. Engin migration.

Mikilvægt: Ef eldri ZIP bjó til möppuna
C:\GLÖGGT\gloggt-verk-dagsskipulag-skali-leit-stada-20260920
þarf að eyða þeirri möppu áður en TypeScript er keyrt, annars tekur tsc hana líka með.

Próf:
npx tsc --noEmit
