GLÖGGT – QR/Mobile frágangur 20. september 2026

Markmið
- Litlir QR-límmiðar eiga að nýtast við mæla inni í vélum og á verkfæri.
- Valin límmiðastærð skal þýða raunverulega breidd × hæð.
- 1,5 × 0,8 cm á því að vera lárétt merki, ekki mjór/hár rammi.
- Minnstu merkin sýna eingöngu tækjanúmer + QR og eyða sem minnstu plássi.
- 0,5 cm QR er prófunarstærð. Lesgæði ráðast m.a. af stærð, prentara,
  merkimiða og myndavél/skanna og þarf að raunprófa áður en mikið er prentað.
- Eftir að Mobile-stillingar hafa verið opnaðar í fyrsta sinn er aðgangur að
  þeim lítill tannhjólstakki í haus, ekki stór aðgerðarflís.

Breytingar í þessum pakka
1. QR-forskoðun notar ekki lengur stóra min-height/min-width né p-8 sem teygði
   1,5 × 0,8 cm merki upp í háan ramma á skjánum.
2. Forskoðun notar sömu líkamlegu cm-mál fyrir breidd og hæð og valið merki.
3. Compact-merki notar 0,02 cm innri spássíu og 0,03 cm hornrúnun.
4. Tækjanúmer og QR sitja hlið við hlið með mjög litlu bili.
5. Sjálfvirkt 0,5 cm QR-merki er u.þ.b. 1,15 × 0,62 cm.
6. Prent-CSS fær dynamic @page size sem fylgir völdu merki; þetta hjálpar
   Chrome/label-printer driver að halda réttri orientation og physical size.
7. Mobile tannhjólið eftir fyrstu notkun minnkar úr 40 × 40 px í 32 × 32 px.

Engin Prisma-breyting er í pakkanum.

Prófun
- npx tsc --noEmit
- Opna 1,5 × 0,8 cm + 0,5 cm QR og staðfesta lárétta forskoðun.
- Prenta eitt merki á límmiðaprentara og mæla raunmál.
- Prófa QR-lestur með síma við raunverulegar aðstæður.
