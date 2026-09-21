GLÖGGT Verk – 5 daga jafnvægispróf load-test gagna
Dagsetning: 21.09.2026

Ástæða
-------
Fyrsta 5 daga prófið með 750 Verk sýndi að heildarfjöldinn var nægur, en dreifingin milli ábyrgðardeilda var ójafn miðað við mönnun og tiltæka getu.

Upprunalega safnið var um það bil:
- Flutningar: 144 Verk
- Viðhald: 233 Verk
- Umhverfi: 94 Verk
- Eftirlit: 138 Verk
- Vélar: 46 Verk
- Lager: 50 Verk
- Ræsting: 45 Verk
- Þjónusta: 0 Verk

Í 5 daga keyrslu fylltust Flutningar, Viðhald og Umhverfi mjög vel en áttu stóran eftirbunka. Eftirlit, Vélar, Lager og Ræsting tæmdu hins vegar sinn Verk-pott of snemma og lækkuðu heildarnýtingu síðari daga vikunnar.

Breyting
--------
seed-verk-load-test.ts velur nú ábyrgðardeild fyrst samkvæmt 5 daga prófunarvægi sem fylgir gróflega tiltækri getu deildanna. Síðan er valið Verk-template innan þeirrar deildar.

Vægi:
- Eftirlit: 26%
- Viðhald: 24%
- Lager: 15%
- Vélar: 11%
- Ræsting: 11%
- Flutningar: 7%
- Umhverfi: 6%

Fyrir 750 Verk gefur deterministic dreifingin:
- Eftirlit: 196 Verk
- Viðhald: 180 Verk
- Lager: 111 Verk
- Vélar: 83 Verk
- Ræsting: 83 Verk
- Flutningar: 52 Verk
- Umhverfi: 45 Verk

Þjónusta fær ekki tilbúin Verk eingöngu til að hækka nýtingu. Þjónustufulltrúarnir eru áfram gagnlegir til að prófa viðveru-/þjónustuhlutverk sem ekki þarf að mæla með Verk-úthlutun.

Óbreytt
-------
- 50 starfsmenn
- 750 Verk sjálfgefið
- forgangsdreifing
- aldur Verkbeiðna
- requiredPeople
- Verk-lengdir
- deadline-dreifing
- staðsetningar og ferðatímar
- hæfni, starfssvið og föst teymi
- 93% hámarkið er í skipuleggjandanum, ekki í seedinu

Þetta er eingöngu breyting á load-test Verkefnasafni. Hún er ekki rekstrarregla fyrir raunveruleg fyrirtæki.

Keyrsla
-------
1. Setja overlay yfir C:\GLÖGGT.
2. Staðfesta TypeScript:

   npx tsc --noEmit

3. Endurgera load-test safnið:

   node --env-file=.env --import tsx scripts/seed-verk-load-test.ts --reset --apply --count=750

4. Þar sem --reset endurstofnar starfsmenn þarf að tengja nýju starfsmennina aftur við vinnudagsprófíl og mönnunarhlutverk:

   node --env-file=.env --import tsx scripts/configure-verk-workday-test.ts --company-id=1 --apply
   node --env-file=.env --import tsx scripts/configure-employee-staffing-test.ts --company-id=1 --apply

5. Keyra sama 5 daga / 08:00 tímabilspróf aftur.

Hvað á að bera saman
--------------------
- nýtingu hvers dags
- starfsmenn með Verk hvers dags
- deildarlega tímabilsgetu
- Verk eftir í hverri deild
- akstur
- 93% hámark einstaklinga
- hvort fimmtudagur/föstudagur haldist nær eðlilegu bili í stað 60% / 42%

Ekki er markmiðið að þvinga allar deildir í 85% alla daga. Einstakir rólegir dagar eru eðlilegir. Markmiðið er að prófunarsafnið hætti sjálft að skapa gervi-flöskuháls í aðeins þremur deildum.
