# GLÖGGT — Pörun fyrst, tillögur fyrir neðan

**Dagsetning:** 6. nóvember 2026

## Ástæða

Í sjónrænni afstemmingu var tillögulistinn settur ofan við valin fylgiskjöl. Þegar leitin fann mörg líkleg skjöl ýtti listinn pörunarsvæðinu og eina „Afstemma“-hnappnum niður fyrir sýnilegt svæði. Notandi á ekki að þurfa að leita að aðalaðgerðinni í eigin vinnuborði.

## Breyting

- Miðjudálkur sýnir bankafærslu, staðfesta sögu ef við á, og **valin skjöl / samtölu / mismun / Afstemma áður en tillögur birtast**.
- Listi valinna skjala er afmarkaður í hæð og skrunanlegur ef mörg skjöl eru valin, án þess að færa samtölu og aðalaðgerð sífellt niður.
- Líkleg fylgiskjöl birtast áfram neðar með **sjálfstæðri skrunun**. Hægt er áfram að opna frumskjöl og bæta skjölum handvirkt til samanburðar.
- Þegar fyrsta skjalið er valið úr tillögum er miðjudálkur færður að upphafinu svo niðurstaða samanburðar birtist. Viðbótarskjöl breyta ekki sjálf skrunstöðu notandans.

## Öryggismörk

Aðeins `VisualReconciliationWorkspace.tsx` breyttist í keyrslukóða. Engum pörunarreglum, aðgangsheimildum, staðfestingarþjónustu, gagnagrunni, skjalaheimildum eða Vercel-stillingum var breytt. Engin sjálfvirk skjöl eru valin og engin tenging er vistuð með leitinni. Aðskilda Production-læsingin `PRODUCTION_DATABASE_TLS_REQUIRED` er óleyst og skal ekki aftengd hér.

## Prófanir og útgáfa

Viðbætt er afmarkað `scripts/visual-layout-priority.test.cjs` sem athugar röð, skrunun og varðveislu staðfestingarvarna. Útgáfuskriftan byggir eingöngu á commit `daf72c8` og stoppar ef grunnútgáfa eða vinnumappa er ekki eins og búist var við. Hún framkvæmir `git diff --cached --check`, viðeigandi Node-próf og fulla `npm run build` með óvirkum dæmatengingum áður en grein er send á GitHub. Hún breytir hvorki Production né gagnagrunni sjálfkrafa.

**Næsta skref:** Skoða útgáfuna sem Preview. Eftir að röð miðjudálksins hefur verið staðfest má birta þá sömu útgáfu í Production; vistunaröryggi/TLS er sérstakt verkefni.
