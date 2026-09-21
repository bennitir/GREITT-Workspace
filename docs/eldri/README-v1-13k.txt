GLÖGGT v1.13k – Innsýn: skattar, lífeyrir og kílómetragjald

Afritaðu innihald ZIP yfir C:\GLÖGGT.

Breytt:
- lib/i18n/innsyn.ts

Birtingarlagið þýðir nú fleiri stöðluð fact-heiti fyrir skatta/staðgreiðslu,
lífeyrisgreiðslur og kílómetragjald á is/en/pl/sr.
Dýnamísk nöfn, ökutækjanúmer og aðrir auðkennarar eru varðveittir.
InsightFact/frumgögn í gagnagrunni eru ekki breytt.

Staðfesting:
npx tsc --noEmit

Engin Prisma migration.
