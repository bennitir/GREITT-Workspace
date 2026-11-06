# GLÖGGT — greina læsta „Afstemma“ án þess að opna skrif

**Dags.:** 6. nóvember 2026
**Útgáfugrein:** `utgafa/samstaeda-greining-20261106` (byggir á `36c2cb1`).

## Ástæða

`36c2cb1` var birt á gloggt.is og endurbirt með þremur Production-rofum, en skjámynd staðfestir að `Afstemma` er áfram læst og viðmótið sýnir `Lesandi yfirlit`. Kóðinn reiknar `documentSetCanConfirm` út frá heimild notanda, fullkominni gagnasýn og strangri `documentSetStorageEnabled`-vörn. Einungis af því að rofarnir sjást á Vercel er ekki hægt að álykta að gagnagrunnstengisnið, hlutverk, TLS eða Supabase auðkenni standist. Sér í lagi krefst vörnin afmarkaðra PostgreSQL tengileiða og skýrs `sslmode`.

## Nákvæm breyting

Engin öryggisvörn er opnuð né víkkuð. `documentSetStorageEnabled` skilar áfram **sama boolean gildi**; ný `documentSetStorageState` skilar eingöngu öruggu villuauðkenni og er eina innri sannleikslindin fyrir rofann. Skortur á heimild og ófullkomin gagnasýn er einnig greind án þess að skoða leyndarupplýsingar. Nýtt og lítið textaatriði birtir kóða undir skilaboðum um læsta vistun **aðeins þegar þegar er verið að bera saman skjöl**. Þetta er bráðabirgðagreining, ekki nýtt skref í daglegum verkferli.

Ekki er sýnt eða skráð: lykilorð, gagnagrunns-slóð, Supabase aðgangslykill, gagnagrunnsnotandi, host eða SQL. Engin sjálfvirk bókun, engin gagnagrunnsbreyting og ekkert sjálfvirkt Production deploy fylgir pakkanum.

## Prófun

`NODE_PATH=/opt/nvm/versions/node/v22.16.0/lib/node_modules node --test scripts/visual-document-set.test.cjs`: 9/9 PASS í sandkassa án nets eða gagnagrunns. TypeScript-transpile án setningafræðivillna á fjórum breyttum `.ts`/`.tsx` skrám. **Full Next.js bygging er aðeins keyrð hjá notanda í hreinu útgáfumöppunni.**

## Uppsetning

1. Afþjappa ZIP undir `C:\GLÖGGT` og halda sömu möppuskipan.
2. Keyra `docs\afhending\scripts\2026-11-06-GREINA-AFSTEMMA-LAESINGU.ps1` í PowerShell. Það staðfestir hreina útgáfumöppu á commit `36c2cb1`, býr til afmarkaða grein, afritar eingöngu viðkomandi skrár, keyrir afmörkuð próf og byggingu með ógildum byggingarleyndargildum, síðan commit og push **aðeins við árangur**.
3. Staðfesta Vercel Preview; ef síðar birt í Production, sýnir síðuskjárinn öruggt `Ástæða læsingar`-auðkenni, til dæmis `PRODUCTION_DATABASE_CONNECTION_NOT_APPROVED`. Bera niðurstöðuna aftur í spjallið; engin lykilorð eða connection strings.
4. Leiðrétta **nákvæmu ástæðuna**, ekki víkka heimildina eða breyta Production-gagnagrunns-URL í blindni. Fjarlægja greiningartextann þegar vandamálið er leyst.

**Varúð:** Virkjunarrofarnir eru þegar skráðir í Vercel Production. Þessi kóði hvorki slekkur á þeim né keyrir `Afstemma`; hann gefur aðeins óleyndarlegan greiningarkóða þegar vistun er læst.
