GLÖGGT – Verk: QR, mælamyndir og viðhaldslyklar
Dagsetning: 19.09.2026

Markmið lotunnar
----------------
Þessi lota byggir ofan á WorkResource-kjarnann og Mobile-framkvæmdina.
Hún gerir vél/farartæki/verkfæri rekstrarhæfari í raunverulegu vinnuflæði:

1. QR-merki
- MACHINE, VEHICLE og TOOL fá 16 stafa QR-auðkenni.
- Eldri UUID QR-token úr fyrstu auðlindalotunni eru styttir í migration.
- QR-mynd er mynduð inni í GLÖGGT án ytri QR-þjónustu.
- Sér prentsíða er undir /verk/tilfong/[id]/qr.
- Mobile /mobile/verk getur skannað QR með BarcodeDetector þegar vafri styður það.
- Handvirk innsláttarleið er alltaf til staðar sem fallback.
- Skannað QR opnar /mobile/verk/tilfong/[token] og finnur auðlind aðeins innan virks fyrirtækis.

2. Mælastaða + mynd
- Mælamynd má fylgja desktop eða Mobile mælaskráningu.
- Mobile notar capture=environment til að auðvelda beint myndavélarflæði.
- Mynd er vistuð varanlega í Supabase Storage undir verk/<company>/resources/<resource>/meter/.
- Núverandi fylgiskjolabucket er endurnýtt með aðskildri slóð; engin ný bucket-uppsetning þarf í þessari lotu.
- photoPath á WorkResourceMeterReading geymir storage-lykilinn.
- UI notar tímabundna signed URL til birtingar.
- Mælistaða má ekki lækka í venjulegu Mobile-flæði.

3. Viðhaldslyklar
- Nýtt model WorkResourceMaintenanceKey.
- Nýtt model WorkResourceMaintenanceLog.
- Hægt er að stofna t.d. OLIA-250 / Olíuskipti.
- intervalValue skilgreinir mælibil, t.d. 250 klst.
- warningLeadValue skilgreinir viðvörun, t.d. 25 klst. áður.
- nextDueMeterValue er geymt sérstaklega svo sögulegur viðhaldsferill breytist ekki afturvirkt.
- Staða er afleidd: DUE / SOON / OK / UNSCHEDULED.
- Þegar viðhald er merkt lokið er núverandi mælastaða snapshot-uð og næsta staða reiknuð.
- Viðhald er rekjanlegt með AuditEvent og sér viðhaldssögu.
- Mobile QR-auðlindasíða sýnir viðhaldslykla og leyfir virkum starfsmanni að skrá lokið viðhald.

4. Mobile auðlindasíða
- QR opnar eina auðlind.
- Sýnir núverandi mælastaðu.
- Sýnir virk Verk/Verkþætti sem auðlindin er úthlutuð á.
- Hægt er að skrá mælastaðu + mynd beint af auðlindinni.
- Hægt er að sjá nýlegar mælamyndir.
- Hægt er að sjá viðhaldsstöðu og skrá lokið viðhald.

Fjöltyngi
----------
Nýtt textalag er í lib/i18n/work-resource-operations.ts fyrir is/en/pl/sr.
Enginn nýr notandatexti í þessari lotu þarf að vera bundinn við eina tungumálaútgáfu.

Öryggi og rekjanleiki
---------------------
- QR-token er ekki aðgangsheimild. Notandi þarf áfram innskráningu og aðgang að réttu fyrirtæki.
- Auðlindaleit er alltaf company-scoped.
- Myndaupplestur er takmarkaður við image/* og 12 MB.
- Ef DB-vinnsla bilar eftir myndaupload reynir kerfið að fjarlægja orphan-skjal úr Storage.
- Viðhaldslykill og viðhaldslokun fara í AuditEvent.

Migration
---------
prisma/migrations/20260919224500_add_work_resource_maintenance/migration.sql

Migration:
- styttir fyrirliggjandi WorkResource.qrToken í 16 hex stafi þar sem þarf;
- stofnar WorkResourceMaintenanceKey;
- stofnar WorkResourceMaintenanceLog;
- bætir indexum og FK-tengingum.

Prófunarröð
-----------
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx tsc --noEmit

Raunpróf eftir Production Ready
-------------------------------
1. Stofna/opna vinnuvél í /verk/tilfong.
2. Opna QR-merki og prentsíðu; skanna það í Mobile.
3. Staðfesta að rétt auðlind opnist og virk Verk birtist.
4. Skrá mælastaðu og taka mynd.
5. Staðfesta að mynd og mælastaða birtist bæði Mobile og desktop.
6. Stofna viðhaldslykil, t.d. 250 klst. / 25 klst. viðvörun.
7. Skrá viðhald lokið og staðfesta næsta viðhald.

Ekki í þessari lotu
-------------------
- sjálfvirk stofnun Verkþáttar þegar viðhald kemur á gjalddaga;
- push/tölvupóstviðvaranir um viðhald;
- QR fyrir sjálft Verkið (þessi lota er WorkResource QR);
- verktaka-SMS/QR-aðgangur;
- drag-and-drop og „næsti lausi“;
- AI-lestur á mælamynd (myndin er sönnunargagn, talan er skráð af notanda).
