GLÖGGT v1.13n – lokafrágangur Innsýn tungumálalags

Afrita yfir C:\GLÖGGT:
- lib/i18n/innsyn.ts
- app/innsyn/page.tsx

Síðan:
  npx tsc --noEmit

Engin Prisma migration.
Engum frumgögnum, InsightFact eða bókunum er breytt.

Helstu atriði:
- Lagfærir íslensk mánaðarheiti inni í staðlaðri birtingu (t.d. ágúst/júlí/júní).
- Þýðir samsett Bifreiðagjald / Skilagjald fact-heiti.
- Klárar nokkur eldri staðlað fact-heiti sem sáust neðar í Innsýn.
- Flytur Fylgiskjal, Lán, Skuldareikningur og „Reikningur úr frumgögnum · ekki staðfest greiðsla“ í tungumálalagið.
- Frumheiti fyrirtækja, skjala, aðila, eigna og frjáls texti eru áfram óbreytt.
