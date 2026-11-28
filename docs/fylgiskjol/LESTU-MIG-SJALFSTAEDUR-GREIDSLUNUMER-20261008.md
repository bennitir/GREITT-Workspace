# GLÖGGT – sjálfstæður lestur greiðslunúmera, 08.10.2026

## Tilgangur
Lesa afborgunar-/greiðslunúmer úr PDF-textalagi og yfirförnum canonical-texta með **sömu, almennu reglu**. Ekki þarf OpenAI, sérreglu fyrir Festa/Ergo eða nýja gagnagrunnsskipan til að finna `16 af 480`, `17 af 480`, `13 of 84` og merktan `17/480`.

## Nákvæmlega hvað er breytt
- `lib/receipts/document-instance-reviewed-evidence.ts`: sameiginlegur `findDeterministicOccurrenceEvidence` sem skoðar **öll** viðeigandi talningarmynstur. Tveir ólíkir N/M-kandidatar → `null` (fail-closed), líka þvert á `af/of` og `N/M`. Ómerkt `17/480` er ekki sönnun, því tölur með skástriki geta verið dagsetningar eða önnur gögn.
- `lib/receipts/document-instance-booking.ts`: upprunalegt PDF-textalag nýtir sama lesara í stað sérstakra regex-reglna. Engin breyting á bindingu, sameiginlegri identity-vél, audit eða bókunarheimildum.
- `lib/receipts/document-instance-evidence.ts`: uppruna- og reviewed-verifier hafnar einnig öðru greiðslunúmeri á sömu sönnunarsíðu. Númer þarf áfram að standast frumskjals/hash-, bindingar-, blaðsíðu- og heimildarsannprófanir.
- `lib/receipts/ingestion.ts`: `deterministicData` fær þrjú **óstaðfest** athugunargildi ef eina talningin í allri textaútdráttarskránni er ótvíræð: `occurrenceSequenceCandidate`, `occurrenceTotalCandidate`, `occurrenceSource: PDF_TEXT_UNVERIFIED`. Þetta er aðeins vísbending fyrir síðari gagnagreiningu; **ekki bókunarheimild eða staðfest skuldartenging**. Ef mörg greiðslutilvik eru í einu PDF hverfur þessi skráarheildar-vísbending; síðu- og bindingarnákvæmur lestur þarf þá áfram að sjá um þau hvert fyrir sig.
- Ný tilfelli í viðeigandi einingaprófum fyrir sameiginlegan lestur, tvöfalda/óljósa talningu og misvísandi frumskjal.

## Öryggismörk
1. Lesinn talningarkandidati sannar hvorki að skjal sé reikningur né að greiðsla sé ný. Staðfest PRIMARY-skuldbinding og current document-instance proof eru áfram sjálfstæð skilyrði.
2. Sama talning sömu skuldbindingar → mögulegt SAME_INSTANCE, önnur staðfest talning → DISTINCT_INSTANCE; mótvægið er reiknað af núverandi duplicate-evaluator, ekki þessum textalesara.
3. Skannað PDF eða gallað textalag getur skilað engum öruggum kandidata. Þá þarf yfirferð / sér OCR-skref síðar.
4. **Þessi plástur slekkur ekki á sjálfvirkri AI-fallback leið sem þegar er í verkefninu.** Slík policy-breyting verður sérstakt, prófað verk fyrir Fylgiskjöl og Innsýn. Við fullyrðum ekki að kerfið sé nú orðið fullkomlega AI-laust.
5. Engin Prisma migration, engar skrifaðgerðir í Production og engar breytingar á bankastemmingu.

## Prófanir
Staðbundin keyrsla á 8 sameiginlegum hreinræktuðum identity/duplicate/occurrence-einingaprófunarskrám: **108/108 stóðust**. Ekkert full-app `npx tsc --noEmit` í verkefnisumhverfi var hægt að keyra með þessu útflutta möppusafni. PostgreSQL-integration og end-to-end/Production-próf eru ókeyrð.

### Setja á vinnustöð (eftir plástur frá morgni)
Pakkinn inniheldur `GLOGGT-GREIDSLUNUMER-AN-AI-20261008.patch`. Afþjappa í Downloads og keyra:

```powershell
cd C:\GLÖGGT
git apply --check "$env:USERPROFILE\Downloads\GLOGGT-GREIDSLUNUMER-AN-AI-20261008.patch"
git apply "$env:USERPROFILE\Downloads\GLOGGT-GREIDSLUNUMER-AN-AI-20261008.patch"
npx tsc --noEmit
npx tsx --test lib/receipts/document-instance-*.test.ts lib/receipts/document-duplicate-reasons.test.ts
git diff --check
git status --short
```

Ef `--check` mistekst skal **ekki** nota `--force`, `--reject` eða yfirskrifa breytingarnar. Stöðva og skoða mismuninn. Halda plástrinum sem uncommitted þar til staðbundin prófun og review eru staðfest.
