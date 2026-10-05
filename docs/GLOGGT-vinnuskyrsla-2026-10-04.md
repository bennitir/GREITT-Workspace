# GLÖGGT – vinnuskýrsla 4. október 2026

**Tímabil:** ca. 14:45–22:30  
**Megináhersla:** Bankaafstemming, diagnostics, FinancialEvent, handvirk pörun, lærdómur og vinnuflæði.

## Yfirlit dagsins

Við byrjuðum á stöðuyfirferð með fersku `docs`-setti og síðan `app`, `lib`, `prisma` og `components`.

Fyrsta niðurstaðan var að afstemmingargrunnurinn væri kominn lengra en eldri skjöl gáfu til kynna: `FinancialReconciliation`, `FinancialEvent`, audit, confirmation og diagnostic-lög voru þegar til, en notendaviðmótið sýndi ekki nógu vel **hvar og hvers vegna afstemmingin stöðvaðist**.

## Helstu verk dagsins

- Byggt var nýtt sjónrænt **bank-diagnostics-v3 stjórnborð** á `/banki/[id]/afstemming`. Það sýnir nú m.a. staðfestar færslur, skýrar tillögur, óleystar færslur, candidate coverage, document → FinancialEvent stöðu og hindranir.
- Staðfest var að **331 bankafærsla** væri í greiningunni. Upphaflega voru **300 án kandidats**, 8 staðfestar og 20 með eina skýra tillögu.
- Greint var að aðeins **33 af 141 yfirförnum skjölum** teldust hæf í venjulega FinancialEvent-materialization. `Hæf án primary event = 0`, þannig að einfalt backfill var ekki meginvandamálið.
- Materialization-hindranir voru sundurliðaðar:
  - **59** óstudd skjalategund
  - **30** án nákvæmlega einnar `INVOICE`-tengingar
  - **10** non-postable hlutverk
  - **4** handvirk flokkun
  - **3** með 0/ófullnægjandi upphæð
  - **2** sérstök greiðsluplön
- Óstuddu skjalategundirnar reyndust vera nákvæmlega:
  - **33 × `PAYMENT_NOTICE`**
  - **26 × `PAYMENT_CONFIRMATION`**
- 30 `ACCOUNTING_DOCUMENT` með 0 `INVOICE`-tengingar voru sundurliðaðar eftir mótaðila. Þar komu m.a. Tryggingastofnun, Lífeyrissjóður verzlunarmanna, HS Veitur, Sjúkratryggingar, Sýslumaðurinn og Hringdu.
- Candidate-leitin var sundurliðuð. Af 300 án kandidats stoppuðu **282 strax vegna þess að engin jafnhá upphæð fannst í núverandi eligible candidate-lögum**.
- Þær 282 voru síðan flokkaðar varfærnislega:
  - **6** bankagjöld
  - **9** vextir
  - **2** bakfærslur
  - **14** kreditkortahreyfingar
  - **251** óþekkt
- Sett var upp sameiginlegt **`ReconciliationFlowKind`** lag svo mismunandi afstemmingarflæði geti síðar fengið eigin candidate-provider í stað þess að ein reikningavél reyni að leysa allt.
- Smíðað var read-only provider registry fyrir **BANK_FEE** og **INTEREST**, alls **15 provider-tillögur**, án nokkurrar sjálfbókunar.
- Við fundum síðan mikilvægan blindan blett: núverandi matcher var ekki að leita í öllum yfirförnum skjölum. Ný read-only greining bar 282 bankafærslur saman við þau.
- Niðurstaðan þar var mjög mikilvæg:
  - **61** bankafærsla átti jafnháa upphæð í yfirförnu skjali
  - **56** innan 30 daga
  - **51** hafði nákvæmlega eitt slíkt skjal
- Þannig voru mörg „engin samsvörun“ í raun **samsvaranir sem candidate-lagið sá ekki**.
- Af þessum faldu mótum voru hindranirnar aðallega:
  - **35** óstudd skjalategund
  - **19** vantaði/ófullnægjandi `INVOICE`-tengingu
  - **2** non-postable hlutverk
- Smíðaður var **REVIEWED_DOCUMENT provider**. Hann fann 32 bankafærslur með rökstudda tillögu:
  - **4** sterk einstök mót
  - **26** möguleg einstök
  - **2** tvíræð
- Handvirk afstemming var síðan gerð að fullgildri leið. Notandi getur nú leitað í yfirförnum skjölum, skoðað þau og parað handvirkt. Staðfesting skráist með audit og sem fyrirtækjasértækt lærdómsdæmi.
- Lærdómsreglan var mótuð þannig að GLÖGGT læri **af staðfestum pörum**, ekki bara af því að skjal sé opnað. Fyrstu dæmi þurfa mannsauga; endurtekin staðfest mynstur geta síðar hækkað confidence.
- Mikilvægt hönnunaratriði kom fram: afstemmingin á **ekki að endurlesa gögn sem bókun/skjalaskoðun hefur þegar fundið**. Hún á að endurnýta canonical facts:
  - mótaðila
  - reikningsnúmer
  - seðil-/kröfunúmer
  - tilvísun
  - upphæð
  - dagsetningu og gjalddaga
  - bókunarlínur
  - lánatengingar
- Leiðandi aðgerðir voru því settar í forgrunn. Þegar skjal hefur þegar `PRIMARY FinancialEvent` á UI nú að sýna skuldbindinguna sjálfa og aðgerðina **„Afstemma við þessa skuldbindingu“** í stað þess að stoppa með upplýsingatexta.
- Við prófuðum þetta með **Sýslumanninum á Suðurnesjum**, tveimur 22.160 kr. skuldbindingum `BK109124410` og `BK109124409`. UI sýndi nú FinancialEvent og afstemmingarhnapp á báðum.
- Reglan um opinbera aðila var skýrð: opinberar kröfur geta komið löngu fyrir greiðslu. **30 dagar mega ekki vera harður útilokunargluggi**. Reiknings-/seðil-/kröfunúmer og canonical identity eiga að vega þyngra; ±90 dagar eða meira geta verið eðlileg leit.
- L15 dæmið staðfesti leiðina vel: **L15 ehf., 21.150 kr., reikningur 0001000** var tengdur við FinancialEvent #40 og síðan staðfest við rétta bankafærslu. Í lok dags sást það grænt sem **„Tenging staðfest“** í aðalafstemmingunni.
- Við fundum að þegar FinancialEvent var þegar fullgreitt gat handvirk pörun valdið `EVENT_PAYMENT_OVER_ALLOCATION`. Kjarninn var rétt að verjast tvígreiðslu; UI var hins vegar lagað til að sýna **greitt / ógreitt / þegar afstemmt** og leiða notandann að þeirri færslu sem þegar á greiðsluna.
- TypeScript-villa í `event-confirmation.ts` vegna Prisma JSON typing var lagfærð með `Prisma.InputJsonObject/InputJsonValue`.
- `pg` gaf deprecation warning vegna `Promise.all` innan sama interactive transaction. Diagnostics-lestrarnir voru raðgerðir innan sama `REPEATABLE READ` snapshot þannig að niðurstaðan helst sú sama en transaction-client er ekki notaður samtímis.
- `.next/dev/types/validator.ts` gaf generated-cache villu. Lausnin var að stöðva dev-server, eyða `.next` og láta Next endurbyggja hana.
- Vinnuflæðisgalli kom fram þegar staðfest pörun sendi notandann aftur efst á langan afstemmingarlista. Það var lagað með **vinnuröð**: eftir afstemmingu fer kerfið áfram í næsta óafstemda mál eða skilar notanda á sama stað.
- Lokaskjáskot dagsins sýndi þetta farið að virka vel: L15 var staðfest og næstu óafstemdu færslur voru beint fyrir neðan, án þess að byrja aftur efst.

## Mikilvægar hönnunarniðurstöður dagsins

### Deterministic + mannsauga

Afstemming á að vera **bæði deterministic og mannleg**.

GLÖGGT á að vera strangt þegar það staðfestir sjálft, en mannsaugað þarf alltaf að geta afstemmt handvirkt.

Þegar mótið er augljóst á að vera nóg að ýta á einn skýran **„Afstemma“** hnapp. Undir húddinu eru samt framkvæmd fail-closed validation, audit og idempotency.

### Lærdómur af staðfestum pörum

Staðfest handvirk pörun á að verða **lærdómsstaðreynd**.

GLÖGGT lærir þá mynstur hjá viðkomandi fyrirtæki og mótaðila:

- identity
- upphæð
- tímasamband
- reference-mynstur
- rétt reconciliation-flow

Það á ekki að læra af röngu skjali sem aðeins var opnað.

### Endurnýta canonical facts

Skjalaskoðun og bókun eru heimildir fyrir afstemmingu.

Ef þar er þegar búið að finna reikningsnúmer, kröfunúmer, mótaðila, upphæð og bókun á afstemmingin að **nota þær staðreyndir**, ekki reyna að finna þær aftur.

### Opinberir aðilar og langur greiðslutími

Opinberir reikningar og kröfur geta komið löngu áður en greiðsla birtist í banka.

Því má fastur 30 daga gluggi ekki vera almenn útilokunarregla.

Reikningsnúmer, seðilnúmer, kröfunúmer, tilvísun og canonical identity eiga að geta vegið þyngra en dagafjarlægð þegar um opinberar kröfur er að ræða.

### Leiðandi aðgerðir

Afstemmingarviðmótið á að leiða notandann áfram út frá þegar þekktum staðreyndum.

Dæmi:

- **Afstemma við þessa skuldbindingu**
- **Opna fylgiskjal**
- **Skoða FinancialEvent**
- **Finna annað mót**
- **Staðfesta handvirkt**

Markmiðið er að GLÖGGT segi ekki bara hvað það veit heldur líka **hver skynsamleg næsta aðgerð er**.

## Nýtt atriði í lok dags – greiðslur til einstaklinga

Við þurfum sérstakt flæði fyrir **greiðslur til einstaklinga**.

Þær eru ekki bara „engin samsvörun“.

Þörfin er meðal annars að geta haldið utan um **stöðu á milli notanda og barna/einstaklinga**.

Þar þarf líklega sérstakt einstaklinga-/viðskiptastöðulag sem getur sýnt:

- inn- og útgreiðslur
- stöðu yfir tíma
- tilgang/flokk greiðslu
- tengsl við fyrri færslur
- mögulegar kröfur/endurgreiðslur

Þetta ætti að vera sérstakt reconciliation-flow, ekki sérhack í bankamatcher.

## Staða þegar vinnu lauk

**Afstemming er farin að virka sem raunverulegt vinnuborð**, ekki bara diagnostic listi.

L15 var staðfest end-to-end og vinnuröðin er komin til að halda áfram í næsta mál.

### Næstu forgangsverkefni

1. Halda áfram að fínpússa **einn-smells afstemmingu** á augljósum mótum.
2. Nýta canonical facts úr skjalaskoðun/bókun enn betur.
3. Gera leiðandi aðgerðir skýrari þar sem `FinancialEvent` er þegar til.
4. Halda áfram að kenna GLÖGGT af staðfestum pörum.
5. Hanna sérstakt flæði fyrir greiðslur til einstaklinga og stöðu milli aðila.
6. Halda áfram að stytta vinnuflæðið þannig að notandi þurfi ekki að fara aftur efst á langan lista milli afstemminga.

## Samantekt

Við byrjuðum daginn með spurninguna:

> **„Af hverju finnur þetta ekkert?“**

og enduðum með fyrstu raunverulegu **handvirku, leiðandi og lærandi afstemminguna** í gangi.

Stærsta framvindan var ekki bara að finna fleiri mót, heldur að skýra arkitektúrinn:

- afstemming endurnýtir facts sem þegar eru til
- mismunandi flæði fá sína eigin reconciliation-aðferð
- mannsaugað getur staðfest þegar deterministic kerfið er viljandi varfært
- staðfestingar verða að lærdómi
- leiðandi UI dregur úr óþarfa handavinnu
