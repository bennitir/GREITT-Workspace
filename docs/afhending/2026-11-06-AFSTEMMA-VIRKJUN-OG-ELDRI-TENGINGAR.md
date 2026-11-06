# GLÖGGT — Eins-smells afstemming: varnir og afhending

**Dags.:** 6. nóvember 2026

## Markmið

Notandi velur bankafærslu, velur eitt eða fleiri rétt yfirfarin skjöl og smellir á **Afstemma** einu sinni. Bakendinn sannreynir fyrirtæki, aðgang, bankareikning, bankastöðu, eldri tengingar, skjalayfirferð og samtölu innan `Serializable`-færslu. Hann varðveitir tengingu og aðgerðasögu, en bókar ekkert sjálfvirkt. Aðrar og eldri færslur sjást áfram í felulista.

## Staðfest staða og ástæða fyrir þessari breytingu

- Í Production hefur bankafærsla **#328** þegar staðfesta afstemmingu **#105** með fylgiskjali **#282**; ekki má endurafstemma hana.
- Bankafærsla **#329**, −901 kr., og Sjóvá-fylgiskjal **#328**, 901 kr., hafa verið borin saman í localhost. Samræmi upphæða eitt og sér er ekki full heimild til vistunar.
- Eldri `FinancialReconciliationParticipant` getur verið skráður með hlutverki öðru en `MONEY_MOVEMENT`/`EVIDENCE`. Staðfest fyrri tenging verður að loka fyrir tvítengingu **óháð role**.
- Breytt var `confirmVisualDocumentSet`: bæði staðfestir bankatenglar og staðfestir skjalatenglar eru kannaðir út frá `sourceType` + `sourceKey` og fyrirtæki, óháð participant-`role`; idempotent endurtekning er aðeins heimil með réttri gerð og réttum hlutverkum.
- Engin gagnagrunnsmigrering, engin breyting á Production og engin heimildarvirkjun felst í þessum ZIP-pakka.

## Öryggisafrit

6.11.2026 kl. 09:15:18 var `pg_dump -Fc -n public` af GLÖGGT Production vistað hér:

`C:\Users\benni\AppData\Local\GLOGGT-DB-AFRIT\GLOGGT-public-20261106-091453.dump`

Stærð: **9.060.376 bæti**. `pg_restore --list` stóðst. Þetta er **ekki** fullprófuð endurheimt og afritið nær **ekki** yfir skjöl í Supabase Storage né öll önnur Postgres-skjema og hlutverk. Ekki yfirskrifa eða senda afritið í spjall.

## Prófanir

Mock-próf: 35/35 PASS, þar af 3 sérpróf fyrir eldri bankatengil, eldri skjalatengil og leyfilega nýja pörun. TypeScript setningafræði staðfest með TypeScript transpilation. **Full Next.js bygging þessarar nýjustu breytingar og Vercel-birting eru eftir** og eru stöðvuð ef bygging mistekst.

## Útgáfa

Pakkinn er afþjappaður inn í `C:\GLÖGGT` með varðveislu fyrirliggjandi vinnu. `docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA.ps1` afmarkar skrár úr núverandi vinnumöppu og byggir þær í hreinu `C:\GLOGGT-LESUTGAFA` ofan á commit `24fdd8b`. Þegar bygging stendur, stofnar hún og sendir aðeins nýja GitHub-grein `utgafa/samstaeda-einsmellur-20261106`. Það **breytir ekki gloggt.is**.

Vercel Preview þarf ónothæfan, aðgreindan byggingartengistreng, ekki Production-lykilorð. Nýja Preview-útgáfan skal vera `Ready` áður en hún er færð í Production. **Skrif haldast læst** á meðan.

## Afmörkuð skrifheimild — aðeins eftir birtingu og sannprófun

Fyrir eitt fyrirtæki/bankareikning eru eftirfarandi breytur til staðar í server-kóða (þær eiga EKKI að vera í `NEXT_PUBLIC_` breytum):

- `GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED=true`
- `GLOGGT_DOCUMENT_SET_PRODUCTION_ENABLE=approved-manual-document-sets-v1`
- `GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE=8:2`

Þær eiga aðeins við **Production**, aldrei Preview, og eingöngu þegar server-kóðinn sannreynir réttan Production-Supabase-tengistreng með TLS, project `wjobcdjhqjirgyfbeuze`, réttum DB-notanda og `NEXT_PUBLIC_SUPABASE_URL`. Röng/ófullnægjandi tenging skal **fail closed**; aldrei losa vörnina til að fá virkan hnapp. Þegar kóðinn er birtur og virkjunin hefur verið samþykkt sérstaklega, fara raunveruleg skrif aðeins fram að lokinni þjónsyfirferð undir réttum aðgangi.

## Næsta verk

1. Afþjappa pakka, birta afmarkaða grein með scriptinu. Staðfesta Preview `Ready`, síðan birta í Production (án þess að kveikja á vistun).
2. Setja afmarkaðar server-breytur **aðeins í Production** ef Vercel-gagnagrunnstengingin uppfyllir ströng skilyrði. Ef ekki, skrá hindrunina; ekki víkka heimild.
3. Á réttum bankareikningi velja óafstemmdan raunverulegan Sjóvá-viðburð og yfirfarið skjal, smella einu sinni á **Afstemma**. Ef það hafnar, sýna skýra ástæðu án þess að breyta gögnum. Við árangur: endurhlaða, sannreyna varðveitta tengingu og AuditEvent, engin sjálfvirk bókun.
