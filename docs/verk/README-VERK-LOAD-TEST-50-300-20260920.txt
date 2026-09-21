GLÖGGT – Verk álags-/leitargögn 20.09.2026

Tilgangur
- Stofna 50 greinilega merkta prófunarstarfsmenn.
- Stofna 300 greinilega merkt ótímasett Verk.
- Öll gögn fara eingöngu í fyrirtækið „Próf ehf 2.“.
- Hvert Verk fær einn fyrsta Verkþátt svo Dagskipulag/úthlutun virki eðlilega.
- Engir login-notendur eru stofnaðir; þetta eru Employee-færslur til skipulagsprófa.

Prófunargögnin eru auðkennd með sérstökum prefixum/merkjum svo hægt sé að hreinsa þau aftur.

ÖRYGGI
Seed-scriptið er DRY RUN sjálfgefið. Það breytir engu fyrr en --apply er gefið.
Ef sams konar prófunargögn eru þegar til neitar það að tvöfalda þau nema --reset sé líka gefið.

1. Skoða hvað yrði gert
node --env-file=.env --import tsx scripts/seed-verk-load-test.ts

2. Stofna 50 starfsmenn + 300 Verk
node --env-file=.env --import tsx scripts/seed-verk-load-test.ts --apply

3. Endurgera prófunarsettið síðar
node --env-file=.env --import tsx scripts/seed-verk-load-test.ts --reset --apply

4. Skoða hvað cleanup myndi eyða
node --env-file=.env --import tsx scripts/cleanup-verk-load-test.ts

5. Eyða prófunargögnunum
node --env-file=.env --import tsx scripts/cleanup-verk-load-test.ts --apply

Gögn
- 50 Employees með employeeNumber GLG-LT-EMP-20260920-xx.
- 300 WorkOrders með externalId GLG-LT-WORK-20260920-xxx.
- workKey GLG-LOADTEST-20260920.
- plannedDate = null.
- plannedStartMinutes = null.
- Mismunandi heiti, staðsetningar, deildir, tungumál, forgangur, mönnunarþörf og áætlaður vinnutími til að prófa leit og síur.
- Myndakrafa NONE.

Athugið
Cleanup fjarlægir einnig úthlutanir og raunvinnutíma sem hafa verið skráðir sérstaklega á þessa prófunarstarfsmenn meðan á prófun stendur. Það snertir ekki aðra starfsmenn eða önnur Verk.
