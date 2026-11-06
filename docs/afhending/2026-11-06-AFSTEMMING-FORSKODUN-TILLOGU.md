# GLÖGGT — Sjálfvirk forskoðun efstu skjaltillögu

**Dagsetning:** 6. nóvember 2026

## Ástæða breytingar

Í sjónrænni afstemmingu birtast nú líkleg skjöl sjálfkrafa í miðjudálknum. En hægri dálkurinn opnast gjarnan á óstaðfestri bókunarlínu og notandi þarf enn sérstaklega að smella á „Opna frumskjal“ við efstu tillögu. Aðgreina þarf *skjal til yfirferðar* frá *skjali sem er valið til samanburðar* og *staðfestri tengingu*. Markmiðið er færri handtök án þess að taka ákvörðun um pörun fyrir notandann.

## Framkvæmd

- Ef óafstemmd bankafærsla hefur gildar, heimildastýrðar skjaltillögur opnast **frumskjal efstu tillögunnar sjálfkrafa til forskoðunar** í hægri dálki. Sama rangraðaða skjallisti og áður er notaður; ekki er bætt við nýrri gagnaleit.
- Forskoðun er merkt sérstaklega á íslensku, ensku, pólsku og serbnesku: þetta er ekki staðfest tenging og hún myndar enga nýja samstæðu.
- Sjálfvirk forskoðun birtist ekki fyrir bankafærslu sem er þegar afstemmd eða hefur staðfesta tengingu. Þar gildir áfram eldri sannreynd sjálfvirk birting staðfestra frumskjala.
- Ef notandinn opnar annað skjal handvirkt er því **ekki yfirskrifað** af tillöguleit. Ef hann lokar forskoðun sjálfur opnast hún ekki aftur sjálfkrafa fyrir sömu bankafærslu í þessari vinnulotu.
- Sjálfvirka skjalaleitin er enn aðeins lesaðgerð. Engin sjálfvirk val á skjölum, staðfesting, bókun, breytt banka-/gagnagrunnsstaða, AI-köll eða breytingar á TLS-/Production-stillingum.
- Frumskjalið fer áfram í gegnum fyrirliggjandi fyrirtækja- og notandaheimildastýrða skjalaleið. Ef það er ekki aðgengilegt skal notandinn geta valið aðra tillögu handvirkt.

## Prófun og takmarkanir

Staðbundin afmörkuð próf staðfestu TypeScript/TSX-þáttun, að sjálfvirk forskoðun noti aðeins fyrirliggjandi heimildastýrðar niðurstöður, að hún skrifi ekki afstemmingu og að handvirk skjalskoðun/lokun sé virt. Full `npm run build` er vísvitandi keyrt í hreinu útgáfumöppunni hjá eiganda; það hefur **ekki** verið keyrt á Production eða gagnagrunni hér.

## Útgáfa og næsta skref

- Grunncommit: `8c2b49b` (`utgafa/samstaeda-sjalfvirkar-tillogur-20261106`).
- Ný sérgrein: `utgafa/samstaeda-forskodun-20261106`.
- Útgáfuskriftan `docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA-FORSKODUN.ps1` krefst hreinnar útgáfumöppu, prófar, byggir með gervitengingum og ýtir aðeins á GitHub ef allt stenst. Hún birtir ekki Production.
- Eftir hugsanlega birtingu skal velja bankafærslu #329 og staðfesta að frumskjal efstu tillögu #328 birtist til skoðunar hægra megin, án þess að val fyrir samanburð aukist sjálfkrafa. Próf með handvirkt opnaðri annarri tillögu og „Loka frumskjali“.
- `PRODUCTION_DATABASE_TLS_REQUIRED` er enn óleyst og er afmarkað verkefni fyrir GitHub Copilot í aðskilinni næturlotu. Ekki slaka á vörninni til að virkja „Afstemma“.
