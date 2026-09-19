GLÖGGT – Verk: auðlindakjarni, teymi, vélar og raunnotkun
Dagsetning: 19. september 2026

Markmið lotunnar
----------------
Þessi lota færir Verk frá PERSON-eingöngu úthlutun yfir í sameiginlegan varanlegan auðlindakjarna fyrir:
- TEAM – teymi
- MACHINE – vinnuvélar
- VEHICLE – farartæki
- TOOL – verkfæri
- CONTRACTOR – verktaka

PERSON heldur áfram að byggja á Employee. Starfsmaður og vél eru því ekki gerð að sama gagnahlut, en þau nota sama úthlutunarhugtak á Verkþætti.

Mikilvæg aðgreining
--------------------
1. Úthlutun segir hvað/ hver er ætlað á Verkþátt.
2. Raunnotkun segir hvað gerðist í framkvæmd og í hvaða magni.
3. Mælastaða segir stöðu mælis á ákveðnum tíma.
4. Kostnaðargrunnur er afleiða af staðfestri raunnotkun.
5. Sölugrunnur er áfram aðskilinn og verður ekki rukkaður sjálfkrafa.

Þetta eru tengd gögn en ekki sami atburðurinn.

Ný gagnalíkön
--------------
WorkResource
- fyrirtæki, tegund, kóði, heiti og lýsing
- staða: AVAILABLE / IN_USE / MAINTENANCE / OUT_OF_SERVICE / INACTIVE
- grunneining notkunar
- núverandi innra kostnaðarverð á einingu
- mögulegur sölugrunnur á einingu
- mælieining og nýjasta mælastaða
- QR-token fyrir MACHINE / VEHICLE / TOOL

WorkResourceMember
- tengir Employee við TEAM
- tengingin er mjúklega lokanleg með removedAt svo saga glatist ekki

WorkResourceMeterReading
- söguleg mælastaða
- dagsetning, gildi, eining, mögulegur Verkþáttur, photoPath og uppruni
- photoPath er grunnur fyrir síðar myndatöku; myndavéla-/upload-flæði er ekki komið í þessari lotu

WorkPartAssignment
- fær workResourceId fyrir TEAM/MACHINE/VEHICLE/TOOL/CONTRACTOR
- PERSON heldur employeeId
- úthlutun er áætlun/tenging, ekki raunnotkun

WorkPartUsageFact
- fær workResourceId fyrir raunnotkun varanlegrar auðlindar
- MACHINE verður MACHINE_TIME
- VEHICLE verður VEHICLE
- TOOL/CONTRACTOR verða OTHER í sameiginlegu magnlíkani í þessari útgáfu
- resourceUnitCostIsk varðveitir kostnaðarverðið sem gilti þegar raunnotkunin var skráð

Sögulegt kostnaðarverð
----------------------
Innra kostnaðarverð WorkResource er núverandi stilling fyrir NÝJA raunnotkun.
Þegar raunnotkun er skráð er kostnaðarverðið snapshot-að í WorkPartUsageFact.resourceUnitCostIsk.

Þetta er viljandi: ef kostnaðarverð vélar/verktaka breytist síðar má eldri Verk ekki endurreiknast í hljóði.
Ef kostnaðarverð vantaði þegar eldri notkun var skráð er það ekki fyllt aftur sjálfkrafa; leiðrétta þarf þá færslu sérstaklega.

Afleiðingar
-----------
Raunnotkun auðlindar býr til tvo afleiðugrunna í Verk-sýn:
- RESOURCE_COST_BASIS
  * COST_READY ef sögulegt kostnaðarverð var vistað
  * COST_MISSING ef það vantaði
  * upphæð = magn × vistað innra kostnaðarverð
- RESOURCE_SALES_BASIS
  * RULE_REQUIRED
  * ekkert er rukkað sjálfkrafa

saleRateIsk má geyma á auðlindaspjaldi sem framtíðar-/sölugrunn, en þessi lota umbreytir því ekki sjálfkrafa í reikningslínu.

UI
--
Ný síða: /verk/tilfong
- stofna auðlind
- breyta heiti/lýsingu/einingu/kostnaðar- og sölugrunni
- breyta stöðu
- setja starfsmenn í teymi
- skrá mælastaða á MACHINE/VEHICLE/TOOL
- sjá hvort QR-auðkenni sé tilbúið

/verk/[id]
- Verkþáttur getur fengið starfsmenn OG varanlegar Verk-auðlindir
- raunnotkun auðlindar er skráð sér frá úthlutun
- ógilding/eyðing raunnotkunar fylgir sömu rekjanlegu leið og efnisnotkun
- á lokuðu Verki þarf ástæðu fyrir leiðréttingu
- afleiðingar sýna auðlindakostnað þegar kostnaðarverð var snapshot-að

/verk
- Vélar/teymi koma úr raunverulegum WorkResource-gögnum í stað placeholder-a
- Vinnuvélar-sýn sýnir MACHINE/VEHICLE/TOOL, stöðu, virkar úthlutanir og mælastöðu
- teymasýn sýnir TEAM og fjölda meðlima
- flýtileið fer í auðlindastjórnun

Fjöltyngi
---------
Nýr UI-texti fyrir auðlindakjarnann er undir lib/i18n/work-resources.ts fyrir is/en/pl/sr.
Nýir textar í Afleiðingum og úthlutun eru einnig komnir í lib/i18n/work10.ts fyrir öll fjögur tungumál.
Frumheiti/lýsing WorkResource eru varðveitt sem sourceLanguage; sérstakt þýðingarlíkan fyrir WorkResource er ekki komið í þessari lotu.

Rekjanleiki
-----------
Stofnun, breytingar, staðabreytingar, teymisbreytingar, auðlindaúthlutun, mælastaða og raunnotkun skrifa rekjanleg gögn/AuditEvent.
Úthlutun varðveitir jafnframt createdBy/removedBy og removedAt í WorkPartAssignment.

Ekki komið í þessari lotu
-------------------------
- QR-skönnunarsíða / opinber QR-leið
- myndataka af mæli eða sjálfvirk lestur mælismyndar
- viðhaldsáætlanir/viðhaldslyklar
- drag-and-drop úthlutun í dagskipulagi
- sjálfvirk "næsti lausi" / raðverk
- Mobile start/stop fyrir vélar/farartæki/verktaka
- reikningsgerð/sala frá RESOURCE_SALES_BASIS
- bókhaldsfærsla á RESOURCE_COST_BASIS

Migration
---------
20260919213000_add_work_resources_core

Hún:
- stofnar WorkResource
- stofnar WorkResourceMember
- stofnar WorkResourceMeterReading
- bætir workResourceId við WorkPartAssignment
- bætir workResourceId og resourceUnitCostIsk við WorkPartUsageFact
- bætir við viðeigandi indexum, unique-reglum og foreign keys

Prófun eftir innsetningu
------------------------
1. npx prisma validate
2. npx prisma generate
3. npx prisma migrate deploy
4. npx tsc --noEmit

Ráðlagt raunpróf
----------------
- stofna TEAM og bæta tveimur starfsmönnum í það
- stofna MACHINE með klst. sem einingu og innra kostnaðarverði
- stofna VEHICLE með km sem einingu
- úthluta TEAM + MACHINE á Verkþátt
- skrá 2,5 klst. raunnotkun vélar
- staðfesta að auðlindakostnaður = 2,5 × costRateIsk
- breyta costRateIsk á vélinni
- staðfesta að eldri 2,5 klst. færsla breytist EKKI, en ný raunnotkun fær nýja kostnaðarverðið
- skrá mælastaða og staðfesta að nýjasta mælastaða sjáist á /verk og /verk/tilfong
