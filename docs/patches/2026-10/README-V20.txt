GLÖGGT – V20 – Endurtekið kröfunúmer á lánum
5. október 2026

Tilgangur
--------
Almennir document-instance regluna sem var staðfest með Festa yfir lánaskjöl þar sem sama kröfunúmer er endurnýtt yfir margar afborganir.

Raunpróf sem leiddi breytinguna
-------------------------------
Ergo lán 104907:
- gjalddagi 12 af 24, krafa nr. 24683, þegar bókað sem fylgiskjal 5
- gjalddagi 13 af 24, krafa nr. 24683, ný bókun

Bæði skjöl eru þegar canonical-tengd við sama virka lán 104907. Því er 24683 ekki einstakt reikningsnúmer heldur endurtekið obligation-reference innan lánsins.

Breyting
--------
- Reviewed/original canonical text má nú staðfesta obligation-reference undir merkingum eins og:
  - Krafa nr. / krafa númer / kröfunúmer
  - Claim no. / claim number
- Þetta gildir aðeins innan núverandi stranga document-instance flæðis þar sem staðfest canonical lánatenging og prentuð afborgunarröð eru til staðar.
- Sama claim-number eitt og sér veitir enga undanþágu.
- Reikningur 24683 án claim/loan semantics helst blocking.

Vænt hegðun
------------
- 12/24 vs 13/24 -> DISTINCT_INSTANCE -> má bóka.
- 13/24 vs sama 13/24 aftur -> SAME_INSTANCE -> blokkar.
- Aðrar duplicate-ástæður halda áfram að blokka óháð þessu.

Engin Prisma migration.
