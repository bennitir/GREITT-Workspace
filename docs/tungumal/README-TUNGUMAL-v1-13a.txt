GLÖGGT v1.13a – tungumálalagfæringar

Byggt ofan á v1.13. Engin Prisma migration.

Breytingar:
- Viðmótstungumál eru nú aðeins þau sem hafa fullan grunn: íslenska, enska, pólska og serbneska.
- AI-skýringarmál halda áfram að bjóða fleiri tungumál.
- Mínar stillingar: dropdown-gildi, checkboxar, fyrirtækisstillingar og handvirk tímaskráning þýdd á is/en/pl/sr.
- Mobile stillingar nota sömu tungumálamörk og sömu þýddu gildi.
- Heim: „Virkar einingar“ og heiti eininga þýdd; „Veldu fyrirtæki til að byrja“ þýtt.
- Tímamælirinn sjálfur er ekki breyttur.

Próf:
npx tsc --noEmit
Síðan endurræsa dev server og prófa is/en/pl/sr.
