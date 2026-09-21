GLÖGGT – tungumálagrunnur + Mobile stillingar v1.13

Byggt á nýjustu app(10), components(3) og lib(2) skrám frá 11.09.2026.

Helst:
- Nýr sameiginlegur UI-tungumálagrunnur: lib/i18n/ui.ts
- Fyrstu fullvirku UI tungumálin: íslenska, enska, pólska og serbneska.
- Sidebar notar valið viðmótstungumál.
- "Workspace" breytt í "Lausnir fyrir reksturinn" (og þýðingar).
- Heim notar valið tungumál fyrir kveðju, tölfræði og Vinnusögu-kort.
- Mobile heimaskjár notar valið tungumál.
- Ný síða /mobile/stillingar.
- Mobile stillingar skrifa í sömu UserSettings og desktop.
- saveMySettings getur farið aftur á /mobile/stillingar eftir vistun.
- Desktop Mínar stillingar notar sama tungumálagrunn fyrir helstu fyrirsagnir.

ATH:
- Önnur tungumál eru áfram valanleg sem áður, en falla aftur á íslensku fyrir UI þar til fullur pakki fyrir þau er til.
- Engin Prisma breyting/migration er í þessum pakka.
- Tímamæliskóðanum sjálfum er ekki breytt.
- app/page.tsx er byggt beint á nýju app(10) útgáfunni þar sem "Velkominn í GLÖGGT." var þegar rétt.

Eftir afritun:
  npx tsc --noEmit
  npm run dev

Próf:
1. Mínar stillingar -> English -> Vista.
2. Staðfesta Sidebar + Heim.
3. Fara í /mobile -> Settings -> Polski eða Српски -> Save.
4. Staðfesta að Mobile breytist og sama val sjáist aftur á desktop.
5. Láta tímamælinn ganga óáreittan á meðan.
