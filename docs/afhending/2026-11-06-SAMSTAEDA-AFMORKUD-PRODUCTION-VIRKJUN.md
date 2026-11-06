# GLÖGGT — samstæða: afmörkuð virkjunarleið

**Dags.:** 6. nóvember 2026
**Staða:** Kóðabreyting tilbúin í staðbundna vinnumöppu; **EKKI virkjað í Production**.

## Tilefni

Þriggja dálka lesútgáfa sjónrænnar afstemmingar er birt á gloggt.is og PDF-frumskjalasýn virkar. Staðfestingarhnappurinn er enn læstur. Kóðinn fyrir mannlega staðfestingu, varanlega tengingu margra skjala við bankafærslu, aðgerðasögu og afturköllun er þegar til í `FinancialReconciliation` og `FinancialReconciliationParticipant`. Engin ný tafla er nauðsynleg vegna þessarar breytingar.

## Breytingar nú

- `lib/financial-reconciliation/document-set-service.ts`: bætt við fail-closed Production-virkjunarleið, **aðeins fyrir tiltekið companyId og bankAccountId**. Það þarf samhliða tvo skýra rofa, raunverulegt Vercel Production-umhverfi, nákvæmlega rétta Supabase Production project-ref í tengingu og sama project-ref í `NEXT_PUBLIC_SUPABASE_URL`. Einnig þarf TLS og kannar `DIRECT_URL` ef það er skilgreint. Röng eða ófullnægjandi stilling heldur vistun læstri.
- `app/banki/[id]/afstemming/page.tsx`: miðlar server-staðfestu fyrirtæki og bankareikningi að rofanum áður en staðfesting birtist virk.
- `app/banki/[id]/afstemming/document-set-actions.ts`: framkvæmir sömu athugun á **þjóninum** áður en skrif- eða afturköllunaraðgerð er kölluð. Ekki er treyst á auðkenni fyrirtækis frá vafra.
- `scripts/visual-document-set.test.cjs`: prófar m.a. að rangt fyrirtæki, annar bankareikningur, röng Supabase-tenging, Preview, localhost eða vantaða samþykkt haldi rofanum læstum.

## Virkjun er EKKI hluti af þessu ZIP

Til að virkja **síðar, eftir sérstaka heimild og samþykkt á raunverulegu Production-gagnasafni**, þyrfti að stilla eftirfarandi server-side umhverfisbreytur í Vercel Production:

- `GLOGGT_DOCUMENT_SET_CONFIRM_ENABLED=true`
- `GLOGGT_DOCUMENT_SET_PRODUCTION_ENABLE=approved-manual-document-sets-v1`
- `GLOGGT_DOCUMENT_SET_PRODUCTION_SCOPE=<staðfest companyId>:<staðfest bankAccountId>`

Síðan verður `VERCEL_ENV=production` og `VERCEL=1` að vera komið frá Vercel, og núverandi `DATABASE_URL` og `NEXT_PUBLIC_SUPABASE_URL` þurfa að vísa á **Production** verkefni GLÖGGT, `wjobcdjhqjirgyfbeuze`. Leyft er að nota Supabase beint eða viðeigandi eu-west-1 pooler með notandanafninu `postgres` / `postgres.<project-ref>`, SSL og DB `postgres`. Óþekktar tengileiðir verða áfram læstar. **Ekki setja þetta í `.env`, ekki virkja enn, ekki setja leynigildi í spjall eða skjöl.**

Virkjun þarf fyrst afmarkaða yfirferð á raunverulegum töflum, hlutverkum og áhrifum `RECONCILED`-stöðu bankafærslu, ásamt samþykki eiganda fyrir fyrstu skrifaðgerðinni. ZIP-skráin gerir engin gagnagrunnsskrif, breytir engum Vercel-stillingum og opnar ekki vistun af sjálfu sér.

## Núverandi varnir (óbreyttar)

Mannleg staðfesting, engin sjálfvirk bókun; aðgangsheimild `canReconcileBookkeeping`, ekkert skrif í „Prófa sem notandi“; bankafærsla og skjöl bundin sama fyrirtæki; skjal þarf staðfesta yfirferð og rétta revision; tvírit, önnur staðfest samstæða, greiðslutenging og fjölskylduúthlutun stöðva aðgerð; samtala skjala þarf að stemma við bankafærslu; `Serializable`-færsla með audit-skráningu; afturköllun krefst ástæðu og audit og hafnar þegar greiðslutenging hefur myndast.

## Staðfest

`node --test scripts/visual-document-set.test.cjs`: **8/8 PASS**, án nettengingar eða gagnagrunnsskrifa. Heildar-Next.js-bygging í núverandi staðbundnu verkefni **ekki keyrð í þessari lotu**. Síðasta sjálfstæða hreina lesútgáfa stóðst byggingu á Vercel og er birt á gloggt.is.

## Næsti upphafspunktur

Setja uppfærðar skrár beint í `C:\GLÖGGT`, varðveita yfirskrifaðar breytingar. Skoða og sameina aðeins þessar fáu skrár í nýja útgáfugrein þegar við erum tilbúin. **Ekki** setja fram að Production-staðfesting sé virk; hún er enn læst þar til útgáfan og sértæk heimild eru komin í loftið.
