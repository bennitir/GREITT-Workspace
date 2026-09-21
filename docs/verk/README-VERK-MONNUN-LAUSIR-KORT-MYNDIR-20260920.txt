GLÖGGT – Verk: mönnun, áætlun, lausir starfsmenn, leiðsögn og valkvæð myndakrafa
20. september 2026

Markmið
- Skipulagning á Dagskipulagi á að vera hröð og halda stjórnanda á sama skjá.
- Úthlutun starfsmanns er áætlun; hún byrjar aldrei tímaskráningu sjálfkrafa.
- Verk og Verkþættir geta haft skráðan starfsmannafjölda og áætlaðan vinnutíma.
- GLÖGGT getur bent á starfsmenn sem gögnin sýna sem lausa núna, en stjórnandi velur alltaf.
- Starfsmaður getur opnað leið að staðsetningu Verks.
- Myndakrafa er valkvæð og sjálfgefið Engin.

Breytingar
1. Verk fær requiredPeople, estimatedMinutes og photoRequirement.
2. Verkþáttur fær sömu áætlun; myndakrafa getur erft sjálfgefna kröfu Verks.
3. Dagskipulag sýnir x/y úthlutað og áætlaðan tíma.
4. Drag-and-drop úthlutun heldur notanda á Dagskipulagi; engin sjálfvirk navigation eftir drop.
5. Lausir starfsmenn: fyrsta útgáfa byggir eingöngu á núverandi hörðum gögnum:
   - virk tímaskráning => Í vinnu
   - virk úthlutun á öðru opnu Verki => Úthlutað
   - hvorugt => Laus núna
   Vaktir, hæfni og ferðatími eru ekki ágiskuð; þau bætast við þegar slík gögn eru til.
6. Opna leið notar heimilisfang Verks og opnar kort/leiðsögn í nýjum glugga.
7. Myndakrafa getur verið NONE, START, PROGRESS, PART_COMPLETE eða WORK_COMPLETE.
   - NONE er sjálfgefið og eldri Verk fá enga myndakröfu við migration.
   - Myndir eru vistaðar rekjanlega með Verki/Verkþætti, stigi, notanda og tíma.
   - WORK_COMPLETE er krafist áður en síðasti opni Verkþáttur er kláraður og áður en Verkinu er lokað.
8. Á þegar stofnuðu Verki má breyta mönnun, áætluðum tíma og myndakröfu í Verksýn.

Migration
prisma/migrations/20260920170000_add_work_planning_and_evidence/migration.sql

Próf eftir uppsetningu
- Stofna Verk sem þarf 2 starfsmenn og skrá áætlaðan tíma.
- Draga einn starfsmann inn á Verkið og staðfesta að Dagskipulag haldist opið og sýni 1/2.
- Staðfesta að laus starfsmannatillaga sýni aðeins starfsmenn sem eru hvorki í virkri vinnu né úthlutaðir á annað virkt Verk samkvæmt núverandi gögnum.
- Opna leið frá desktop og Mobile.
- Prófa Verk með Myndakrafa = Engin: ekkert aukaskref á að birtast.
- Prófa Verk með myndakröfu: Mobile á að krefjast réttrar myndar á viðeigandi stigi.
- Staðfesta að drag-and-drop byrji ekki tímaskráningu; Hefja vinnu er áfram sérstök aðgerð.
