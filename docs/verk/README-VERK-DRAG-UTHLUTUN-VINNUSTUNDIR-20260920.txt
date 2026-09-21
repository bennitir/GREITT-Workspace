GLÖGGT – Verk / drag-and-drop úthlutun / vinnustundir starfsmanns
20. september 2026

MARKMIÐ
- Gera Fólk-dálkinn á Verk-skjá að virku skipulagsverkfæri.
- Leyfa að draga starfsmann á þegar stofnað Verk eða beint á ákveðinn Verkþátt.
- Halda núverandi dropdown-úthlutun óbreyttri sem fallback.
- Gera nafn starfsmanns smellanlegt fyrir vinnustundayfirlit úr raunvinnufærslum.
- Leggja gagnagrunn að síðari ábendingum um hverjir séu lausir, án þess að taka ákvörðun fyrir stjórnanda.

DRAG-AND-DROP
- Starfsmaður í Fólk-lista er dragganlegur.
- Sleppa má honum á Verk í dagskipulagi eða á valið Verk hægra megin.
- Ef Verkið hefur einn opinn Verkþátt fer úthlutun beint á hann.
- Ef fleiri opnir Verkþættir eru til opnast valgluggi þar sem stjórnandi velur þátt.
- Sleppa má starfsmanni beint á ákveðinn Verkþátt.
- Lokuðum Verkþætti er ekki hægt að úthluta nýjum starfsmanni.
- Eldri Verkþáttur sem er enn projected úr legacy-gögnum er vistaður í varanlega kjarnann við fyrstu drag-úthlutun.
- Núverandi server actions og rekjanleg úthlutun eru endurnýtt; engin ný samsíða úthlutunarleið er búin til.

VINNUSTUNDIR STARFSMANNS
- Smellur á nafn starfsmanns opnar vinnustundayfirlit.
- Tímabil: dagur, vika, mánuður og allt.
- Sýnir Verk, Verkþátt, dagsetningu, tíma og skráningarmáta.
- Tímar byggja á raunvinnufærslum, ekki aðeins úthlutun.
- Lokið Verk heldur áfram að teljast með í sögulegu vinnustundayfirliti.
- Sérstakur hlekkur heldur aðgangi að starfsmannaspjaldi.

LAUS / ÚTHLUTAÐ / Í VINNU
- Í vinnu = virk raunvinna er í gangi.
- Úthlutað = tengdur virku Verki en engin virk raunvinna í gangi.
- Laus = hvorki virk raunvinna né virk Verk-úthlutun samkvæmt þeim gögnum sem Verk hefur nú.
- Þetta er grunnstaða, ekki endanleg hæfnis-/vaktarákvörðun.
- Síðari ábendingar eiga deterministic að taka mið af vakt, hæfni, öðrum Verkum, staðsetningu/ferðatíma, teymi og forgangi áður en AI kemur til greina.

I18N
- Nýir UI-textar eru í íslensku, ensku, pólsku og serbnesku (kyrillískt).

GÖGN / MIGRATION
- Engin Prisma-breyting.
- Engin migration.

PRÓFUN
1. npx tsc --noEmit
2. Opna /verk og Fólk.
3. Dragga starfsmann á virkt Verk með einum opnum Verkþætti.
4. Staðfesta að úthlutun birtist eftir refresh.
5. Prófa Verk með fleiri en einum opnum Verkþætti og staðfesta valglugga.
6. Dragga starfsmann beint á ákveðinn Verkþátt.
7. Smella á nafn starfsmanns og prófa Dagur / Vika / Mánuður / Allt.
8. Staðfesta að lokað Verk með raunvinnu birtist áfram í vinnustundasögu.
