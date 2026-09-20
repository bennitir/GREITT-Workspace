GLÖGGT – Verk / Mobile / QR / Push frágangur
20. september 2026

Markmið þessarar lotu
---------------------
Þessi pakki byggir ofan á production-stöðuna þar sem forgangstilkynningar,
Web Push, notendasértæk Mobile-sýn og Verk10-kjarninn eru þegar virk.
Engin Prisma-migration fylgir þessum pakka.

1. QR-límmiðar
---------------
- Smáir merkimiðar eru nú með skýra layout-reglu:
  * 1,5 × 0,8 cm og 2 × 1 cm: tækjanúmer + QR hlið við hlið.
  * 1,5 × 2 cm og 2 × 2,5 cm: tækjanúmer + QR lóðrétt.
  * stærri merki: full GLÖGGT-framsetning.
- Þegar lítil merkjastærð er valin lækkar QR-stærðin sjálfkrafa niður í þá
  hámarksstærð sem passar á merkið. Þetta kemur í veg fyrir að t.d. 5 cm QR
  lendi inni í 1,5 × 0,8 cm merkimiða og klofni yfir fleiri prentsíður.
- Prent-CSS einangrar QR-merkið sem eina órofa prenteiningu og setur
  break-inside/page-break-inside vörn á merkið og allt innihald þess.
- Ramminn á compact-merki fær örlítið meira lárétt svigrúm án þess að sóa plássi.
- UI minnir á að slökkva á browser "Headers and footers" og nota rétta
  merkjastærð / lágmarks spássíu í límmiðaprentara.

2. Forgangstilkynningar
-----------------------
- Tilkynningar eru nú styttri og sértækari:
  "Brýnt: <heiti Verks>" / "Forgangur: <heiti Verks>".
- Body segir beint hvað gerðist, t.d. "Úthlutað á þig · Aragerði 7 · #4".
- Sama raunatvik er varið gegn tvöföldun í 20 sekúndur til að minnka líkur á
  tvöföldum push vegna tvísmells eða endurtekinnar server-action keyrslu.
- Service worker fær tungumál og timestamp í notification options og heldur
  áfram að renotify-a þegar ný raunveruleg forgangsatburður kemur.
- Þetta getur minnkað líkur á að Android/Chrome túlki prófunartilkynningar sem
  ómarkvissar, en flokkun vafrans/stýrikerfisins er ekki undir fullri stjórn GLÖGGT.

3. Virk Verk og lokuð Verk
--------------------------
- Desktop Verk velur virka listann áfram frá effective Work10-status.
- Innan virkra Verka koma Brýnt/Hátt fyrst, síðan staða og nýjustu Verk.
- Lokuð/hætt Verk haldast utan aðalsýnar og eru áfram í "Lokið Verk" sögu.

4. Úthlutun
------------
- Starfsmannaúthlutun á vistaðan Verkþátt er nú sjónrænt skýrari og fær
  sérstaka "Úthluta starfsmanni" fyrirsögn áður en tæki/teymi/verktakar koma.
- Fyrsta legacy-Verkþátt má áfram vista og úthluta starfsmanni í einu skrefi.

Prófun eftir uppsetningu
------------------------
1. npx tsc --noEmit
2. QR: velja 1,5 × 0,8 cm og staðfesta að QR-stærð fari sjálfkrafa niður í 0,5 cm.
3. Opna print preview. Merkið á að vera ein prenteining; slökkva á Headers and footers.
4. Prenta / skanna 0,5 cm QR með raunverulegum límmiðaprentara.
5. Breyta Verk úr Venjulegt -> Brýnt og staðfesta markvissa push-tilkynningu + hljóð.
6. Breyta aftur niður og síðan upp eftir meira en 20 sek.; ný hækkun á að gefa nýtt merki.
7. Staðfesta að lokið Verk fari í "Lokið Verk" en virkt/foryngsverk sitji fremst.
8. Staðfesta að "Úthluta starfsmanni" sé augljóst á vistaðan Verkþátt.
