GLÖGGT – aðskilnaður áskriftareininga og fyrirtækisstillinga
20. september 2026

Markmið
-------
CompanyModule á nú eingöngu að tákna þjónustur/einingar sem fyrirtækið hefur
virkar í áskrift/entitlement-laginu, t.d. bokhald, sala, laun, birgdir,
vinnustundir og verk.

Boolean fyrirtækisstillingar sem stjórna hegðun innan virkrar einingar eru
nú geymdar í CompanyFeatureSetting. Fyrsta lotan flytur:

- mobile:work
- mobile:inventory-count
- mobile:receipt-capture
- verk:machines

Migration
---------
20260920105000_separate_company_feature_settings

Migration stofnar CompanyFeatureSetting, afritar núverandi mobile:* og verk:*
stillingar úr CompanyModule og eyðir þeim síðan úr CompanyModule. Þannig
halda núverandi fyrirtæki stillingum sínum.

Lögin eftir breytinguna
-----------------------
1. Áskrift fyrirtækis / CompanyModule
2. Virkar þjónustur/einingar
3. Fyrirtækisstillingar / CompanyFeatureSetting
4. Heimildir notanda
5. Notendasértækur Mobile-sýnileiki / UserCompanyMobileFeature

Prófun eftir afritun í C:\GLÖGGT
--------------------------------
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx tsc --noEmit

Síðan prófa:
- /stjornun sýnir aðeins virkar áskriftareiningar.
- Mobile fyrirtækissjálfgefin virkni helst óbreytt.
- Notendasértækar Mobile-yfirskriftir haldast óbreyttar.
- Verk machines capability helst á sama gildi og fyrir migration.
