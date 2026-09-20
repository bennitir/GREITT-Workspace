GLÖGGT – Verk/Mobile forgangur, úthlutun og QR frágangur
20. september 2026

MARKMIÐ
- Virk Verk eiga að ráða aðalsýn. Lokið/hætt við Verk fara úr dagskipulagi og raðverki en eru áfram aðgengileg undir „Lokið Verk“ á Listasýn.
- Fyrsta úthlutun starfsmanns á eldra Verk má fara fram í einu skrefi: GLÖGGT vistar fyrst varanlegan Verkþátt og stofnar síðan úthlutun á sama Verkþátt.
- HIGH/URGENT Verk senda varanlega tilkynningu í GLÖGGT til starfsmanna/teymismeðlima sem eiga Verkið. Ef tækið hefur virkjað Web Push reynir kerfið jafnframt að senda kerfistilkynningu með hljóði.
- Compact QR-merki heldur réttri cm-stærð og fær örlítið meira lárétt svigrúm utan um tækjanúmer + QR án þess að sóa plássi.

MIKILVÆGT UM HLJÓÐ
Web Push getur beðið stýrikerfið um venjulega tilkynningu með hljóði (silent=false) og titringi þar sem það er stutt. Android/iPhone/vafri ræður samt endanlega hvort hljóð heyrist. Hljóðlaus stilling símans, Focus/Do Not Disturb eða slökkt hljóð fyrir PWA getur bælt það. Þess vegna er sama atvik alltaf vistað í GLÖGGT og birtist með ólesnu merki undir bjöllunni í Mobile.

HVENÆR ER SENT?
- Þegar forgangur Verks hækkar inn í HIGH eða URGENT.
- Þegar HIGH/URGENT Verk er nýlega úthlutað á starfsmann.
- Þegar teymi er nýlega úthlutað á HIGH/URGENT Verk fá virkir teymismeðlimir með tengdan GLÖGGT-notanda tilkynningu.
- Ekki er pípt stöðugt meðan Verkið helst í forgangi.

VAPID / WEB PUSH
Engum nýjum npm-pakka er bætt við. Web Push útfærslan notar node:crypto og fetch sem þegar fylgja Node/Next umhverfinu.

Búðu til eitt varanlegt VAPID-lyklapar fyrir GLÖGGT:
  node scripts/generate-vapid-keys.mjs

Skipunin prentar þrjár línur:
  WEB_PUSH_VAPID_PUBLIC_KEY=...
  WEB_PUSH_VAPID_PRIVATE_KEY=...
  WEB_PUSH_VAPID_SUBJECT=https://gloggt.is

Settu gildin í .env fyrir staðbundna vinnu og sem Environment Variables í Vercel fyrir Production/Preview eftir þörfum.
EKKI senda private lykilinn í spjall, commit eða skjáskot.
HALDA skal sama lyklaparinu til framtíðar. Ef því er skipt út þurfa tæki almennt að stofna PushSubscription aftur.

PRISMA
Nýjar töflur:
- UserPushSubscription: endpoint + p256dh/auth + hljóðstilling tækis + delivery-heilsa.
- UserNotification: varanleg in-app tilkynningasaga, lesið/ólesið og tenging við uppruna.

Migration:
  prisma/migrations/20260920131500_add_mobile_push_notifications/migration.sql

UPPSETNING / PRÓF
1. Afþjappa pakkanum yfir C:\GLÖGGT.
2. Keyra:
     npx prisma validate
     npx prisma generate
     npx prisma migrate deploy
     npx tsc --noEmit
3. Búa til/stilla VAPID-lykla ef þeir eru ekki þegar til.
4. Commit + push.
5. Í Mobile > Stillingar: „Virkja tilkynningar“ og leyfa Notifications í símanum/vafranum.
6. Úthluta starfsmanni á Verk og setja forgang HIGH eða URGENT. Prófa bæði:
   a) Mobile opið.
   b) PWA/vafri í bakgrunni eða skjár slökktur.
7. Staðfesta að bjallan í Mobile sýni ólesið atvik jafnvel ef OS bældi hljóðið.

QR
- 1,5 × 0,8 cm er raunveruleg width × height í preview/print.
- Compact rammi notar nú um 0,5 mm lárétta innri spássíu og 0,25 mm lóðrétta spássíu.
- 0,5 cm QR er áfram prófunarstærð; lesgæði ráðast af stærð, prentara, límmiða og myndavél/skanna.
