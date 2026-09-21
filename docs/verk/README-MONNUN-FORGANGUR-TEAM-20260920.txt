GLÖGGT – Verk / mönnunaráfangi 20.09.2026

Markmið
- Fækka klikkum við mönnun.
- Láta ómönnuð/undirmönnuð Verk víkja fyrir fullmönnuðum í Verkalista.
- Láta forgang ráða hvaða Verk fær fólk fyrst innan þeirra Verka sem vantar mönnun.
- Nota gögn fyrst: tiltækileika, skráða hæfni, tengdan búnað, teymi og sögulega pörun.
- GLÖGGT leggur til; stjórnandi staðfestir alltaf.

Helstu breytingar
1. Verkalisti
   - Verk sem vantar fólk birtast á undan fullmönnuðum Verkefnum.
   - Innan mönnunarþarfar ræður forgangur röðinni; síðan áætlaður tími og mannaþörf.
   - Hvert undirmannað Verk fær beinan „Manna Verk“ takka.

2. Manna Verk
   - Einn smellur opnar mönnunarspjald.
   - Sýnir mannaþörf, hæfnikröfur og tengdan búnað.
   - Topptillögur eru raðaðar eftir tiltækileika, hæfni, teymi og fyrri pörun.
   - Hægt er að úthluta einum starfsmanni eða samþykkja teymistillögu í einu.
   - Búnaður í MAINTENANCE/OUT_OF_SERVICE/INACTIVE stoppar örugga teymistillögu.

3. Morgunmönnun
   - Sérstakur hamur í Verkalista, sjálfgefið kl. 08:00.
   - Sýnir fjölda óúthlutaðra starfsmanna og Verka sem vantar fólk.
   - „Búa til tillögu“ býr til heildartillögu að mönnun án þess að vista hana.
   - Forgangur ræður hvaða Verk fá starfsmenn fyrst; síðan tími, mannaþörf, hæfni, búnaður og lærð pörun.
   - „Staðfesta tillögu“ er eina aðgerðin sem skrifar úthlutanir.

4. Lærð pörun
   - Byggir á sögulegum WorkPartAssignment færslum.
   - Tveir starfsmenn teljast hafa unnið saman þegar úthlutunartímabil þeirra skarast á sama Verkþætti.
   - Teymistillaga gefur fyrri samvinnu vægi en lætur hana aldrei yfirskrifa skráða hæfni eða tiltækileika.

5. Hæfni og vélar
   - EmployeeQualification.qualificationCodes er notað þegar Work hefur tengdan búnað með hæfnikóða.
   - Núverandi prófunargögn hafa hæfnikóða í lýsingu tækis ("Hæfnikóði: CODE").
   - Ef engin skýr hæfnikrafa er til er starfsmaður merktur „hæfni óstaðfest“ í stað þess að kerfið giski.

Engin Prisma migration í þessum pakka.

Próf
npx tsc --noEmit

Tillaga að raunprófi á Próf ehf 2.
- Opna Verk > Verkalisti.
- Staðfesta að Verk sem vantar fólk séu efst og forgangur ráði röð innan þeirra.
- Smella „Manna Verk“ á vélatengt Verk og skoða toppframbjóðendur/hæfni.
- Prófa teymistillögu á Verki sem vantar fleiri en einn.
- Prófa Morgunmönnun kl. 08:00 og skoða tillöguna áður en hún er staðfest.
- Eftir nokkrar samþykktar samhliða úthlutanir má prófa hvort fyrri pörun fari að sjást í næstu tillögum.
