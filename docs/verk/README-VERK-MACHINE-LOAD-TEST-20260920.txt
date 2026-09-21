GLÖGGT – vélamenn + vélar álagspróf 20.09.2026

Forsenda
- 50/300 load-test gögnin þurfa þegar að vera til í „Próf ehf 2.“.

Hvað seed bætir við
- 18 vélar/tæki/ökutæki með raunhæfum heitum, stöðum, mæligildum og kostnaðar-/sölugrunni.
- 14 af prófunarstarfsmönnunum verða greinilegir vélamenn/tæknimenn.
- Vélatengd réttindi/hæfni eru skráð í EmployeeQualification með hæfnikóðum.
- 36 núverandi Verkþættir fá samstæða vél/tæki + starfsmann sem hefur viðeigandi hæfnikóða.
- 1 vél er í MAINTENANCE og 1 í IN_USE til að prófa stöðumeðferð.
- Öll upprunalegu 300 Verkin halda áfram að vera ótímasett; scriptið býr ekki til fleiri Verk.

Dry run
node --env-file=.env --import tsx scripts/seed-verk-machine-load-test.ts

Apply
node --env-file=.env --import tsx scripts/seed-verk-machine-load-test.ts --apply

Endurgera vélaviðbótina
node --env-file=.env --import tsx scripts/seed-verk-machine-load-test.ts --reset --apply

Hreinsa aðeins vélaviðbótina – skilur 50 starfsmenn + 300 Verk eftir
node --env-file=.env --import tsx scripts/cleanup-verk-machine-load-test.ts --apply

Engin Prisma migration.

Prófunarhugmyndir
1. Tæki / búnaður: leita að Volvo, CAT, Bobcat, Toyota, Manitou o.s.frv.
2. Opna vél og staðfesta mæligildi/stöðu.
3. Skoða starfsmenn með „Vélamaður“ og athuga réttindi/hæfni þegar UI styður það.
4. Opna Verk sem hefur tækjaúthlutun og sjá hvort maður + vél birtast saman.
5. Prófa hvort MAINTENANCE tæki sé rétt meðhöndlað í úthlutun.
6. Nota gögnin síðar til að prófa „hver er laus og hefur rétta hæfni?“.

Merki
- Resource code prefix: GLG-LT-RES-20260920-
- Qualification notes: [GLÖGGT MACHINE LOAD TEST 2026-09-20]
- Tagged person assignment resourceLabel: GLG-LT-MACHINE-ASSIGN-20260920
