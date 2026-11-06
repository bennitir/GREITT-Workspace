# GLÖGGT — Líkleg skjöl úr heiti bankafærslu

Dagsetning: 6. nóvember 2026. Byggt á Production-kóðagreininni `90901a7`.

## Af hverju

Bankatextinn „Sjóvá-Almennar líftrygging“ er ekki bókstaflega sá sami og skráð heiti fylgiskjala „Sjóvá-Almennar tryggingar hf.“. Fyrri leit notaði `contains` á allan strenginn og fann því ekkert þegar notandi sló inn „líftrygging“. Það var óþarft að láta notandann leita handvirkt að augljósum tillögum.

## Nýtt vinnulag

- Heiti bankafærslu í miðjudálki er smellanlegt; smellur framkvæmir **heimildastýrða, lesandi** leit að fyrsta einkennandi seljandaorðinu, t.d. Sjóvá.
- Niðurstöður í miðjudálki eru raðaðar eftir **sömu nákvæmu fjárhæð**, nálægri dagsetningu og sameiginlegum orðum seljanda. Það er aðeins forgangsröðun, ekki staðfesting.
- Notandi getur skoðað frumskjal eða bætt hverju skjali við tímabundinn samanburð. Ekkert er valið sjálfkrafa.
- Þegar handvirk leit með fleiri orðum skilar engu og orðin eru í heiti valinnar bankafærslu, er leitað víðar eftir seljanda með **sýnilegri viðvörun** um víkkun leitar.
- Þegar staðfest tenging er til, er skjalið merkt „Þegar tengt“ og ekki boðið til nýs samanburðar. Ófullnægjandi gögn eða frátekið skjal heimila ekki vistun.
- Áfram sama fyrirtækjaheimild og eldri `searchVisualDocuments` aðgerð. Engin sjálfvirk bókun eða AI.

## Afmörkun og stöðuvitneskja

Þessi breyting snertir aðeins lesandi tillögur og leit; hún breytir **hvorki** `document-set-service.ts` **né** virkjun Production. Síðasti þekkti Production-læsingarkóði var `PRODUCTION_DATABASE_TLS_REQUIRED`, og það á að leysa sjálfstætt, ekki með því að veikja skrifvarnir.

Aðeins 25 skjöl úr núverandi skjalaleit geta komið til greina; síðar má bæta við gagnagrunnsleit sem notar mótaðila, fjárhæð og dagsetningarglugga án þess að fela aðrar niðurstöður.

## Prófanir og útgáfa

Heimildapakkinn inniheldur synthetic `scripts/visual-document-suggestions.test.cjs` sem prófar Sjóvá-dæmið og málfræði. Auk þess voru 23 afmörkuð próf staðin í verkvinnsluumhverfinu án net- eða gagnagrunnsaðgangs. Full `npm run build` á að fara fram í hreinu útgáfumöppunni áður en ný GitHub-grein er send.

Eftir að ZIP er afþjappað í `C:\GLÖGGT` er skriftan `docs/afhending/scripts/2026-11-06-UTGAFA-AFSTEMMA-TILLOGUR.ps1` keyrð þar. Hún stöðvar á rangri grunnútgáfu og sendir aldrei ef bygging bregst. Engin sjálfvirk Production-birting.
