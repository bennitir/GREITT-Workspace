GLÖGGT v1.13l – Innsýn: tryggingar + lán

Afritaðu innihald ZIP yfir C:\GLÖGGT.

Breytt:
- lib/i18n/innsyn.ts

Birtingarlagið þýðir nú stöðluð heiti fyrir tryggingartímabil, tryggingagreiðslur,
greiðsludreifingu og helstu lánaliði (greiðslufyrirkomulag, ökutæki, til greiðslu,
gjöld, vaxtatímabil, lánsfjárhæð, afborgunarform, veð og verðbætur).

Frumgögn/InsightFact eru ekki breytt. Engin Prisma migration.

Próf:
  npx tsc --noEmit
