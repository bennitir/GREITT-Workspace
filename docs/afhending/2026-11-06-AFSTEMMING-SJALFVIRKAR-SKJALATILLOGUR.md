# GLÖGGT — Sjálfvirkar skjaltillögur þegar bankafærsla er valin

**Dagsetning:** 6. nóvember 2026

## Hvers vegna

Í sjónrænni afstemmingu var hægt að smella á heiti bankafærslu til að finna líkleg fylgiskjöl. Notandinn vill að bankafærslan sjálf kalli fram tillögur; hann á ekki að þurfa að smella sérstaklega á heitið. Rétt daglegt ferli er: velja bankafærslu → sjá líkleg skjöl → yfirfara frumskjal → velja fyrir samanburð → handvirkt „Afstemma“ þegar allar varnir standast.

## Afmörkuð breyting

- Þegar ólokin bankafærsla er valin í vinstri dálki er heimildastýrð, **lesandi** skjalaumsókn kölluð sjálfkrafa eftir 220 ms töf. Það gildir einnig um fyrstu óafstemmdar færsluna þegar vinnuborðið opnast.
- Núverandi seljandaleit (`visualMerchantAnchor`) og röðun eftir fjárhæð, dagsetningu og texta (`rankVisualDocumentsForBank`) eru **óbreyttar**. Sjóvá-líftrygging getur því fundið Sjóvá-tryggingaskjöl, en samsvörun er enn aðeins tillaga.
- Niðurstöður eru geymdar **tímabundið í minni vafra**, aðgreindar eftir bankareikningi, færslu og seljanda, með hámarki 20 leitarlykla. Ekki er kallað á leit aftur við hvert hopp milli sömu færslna.
- Leit við eldri færslu er afturkölluð úr viðmótsflæði þegar önnur færsla er valin; seint svar má ekki yfirskrifa tillögur nýrrar færslu. Leit er sleppt fyrir þegar staðfestar færslur.
- Heiti bankafærslunnar er áfram smellanlegt fyrir handvirka **endurleit**, en smellur er ekki lengur nauðsynlegur. Hjálpartextar uppfærðir á IS/EN/PL/SR.
- Engin sjálfvirk skjalaval, samstæða, staðfesting, bókun, gagnagrunnsskrif eða AI-köll eru framkvæmd af þessari breytingu.

## Óbreytt og ólokið

- Pörunarsvæði (valin skjöl, samtala, mismunur og „Afstemma“) er áfram ofan við tillögulistann.
- Server action framkvæmir áfram fyrirtækjasértæka heimildaskoðun. Viðmótið má ekki nota tillögur sem sönnun.
- Production-læsingin `PRODUCTION_DATABASE_TLS_REQUIRED` er **óleyst**, og hvorki sú vörn né Vercel/Supabase/Production er breytt í þessari vinnulotu. Öryggisrýni er sérverk fyrir Copilot þegar hönnunarvinnulotu lýkur.

## Prófanir og afhending

- `scripts/visual-auto-document-suggestions.test.cjs` athugar keyrslu við færsluval, stutta töf, minnisvistun, varnir gegn gömlum svörum, rekjanlegar heimildir og skort á sjálfvirkum skrifum.
- Farið er yfir eldri próf fyrir líkleg skjöl, uppröðun miðjudálks, eins-smells staðfestingu og vinnulista.
- Afhendingarskriftan byrjar **aðeins á commit `b395b18`** í hreinu `C:\GLOGGT-LESUTGAFA`, tekur aðeins viðkomandi skrár úr `C:\GLÖGGT`, framkvæmir próf og fulla byggingu með óvirkum dæmatengingum og sendir sérgrein til GitHub ef allt stenst. Hún birtir **ekki** Production og breytir ekki gagnagrunni.

**Næsta sýnilega staðfesting:** Eftir Preview og valfrjálsa Production-birtingu opna sjónræna afstemmingu, velja aðra óafstemmdar færslu og sjá að tillögulistinn uppfærist sjálfur. Fyrir Sjóvá #329 á 901 kr. fylgiskjalið #328 að raðast ofar en skjöl með sömu upphæð á annarri dagsetningu. Þessi tilraun má ekki vista samstæðu sjálfkrafa.
