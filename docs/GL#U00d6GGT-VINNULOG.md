# GLÖGGT – vinnudagbók

Þessi skrá varðveitir þróunarsögu GLÖGGT.

Markmiðið er að skrá:
- hvað var unnið
- hvað var prófað
- hvað tókst
- hvað mistókst
- mikilvægar hönnunar- og kerfisákvarðanir
- Git commit og deployment
- ólokin verkefni
- nákvæman stoppunkt fyrir næstu vinnulotu

## Reglur

1. Nýjasta vinnulota fer efst.
2. Ekki breyta eldri niðurstöðum til að láta þær passa við nýja stöðu.
3. Ef fyrri ákvörðun breytist skal skrá nýja ákvörðun og vísa í þá eldri.
4. Aðeins staðfest próf skulu merkt sem staðfest.
5. Commit-hash og production-staða skulu skráð þegar við á.
6. Aldrei skrá lykilorð, API-lykla eða önnur leyndarmál.
7. Vinnudagbókin er þróunarsaga — ekki staðgengill fyrir Git.

---

## 2026-09-12

### Upphaf dags

Haldið áfram eftir vinnulotu 11.–12. september.

Staða við upphaf:
- Fjöltyngt GLÖGGT-viðmótslag komið upp.
- Full viðmótstungumál: íslenska, enska, pólska og serbneska.
- Innsýn staðfest fjöltyngd.
- Þjónustutímakerfi komið með grunn fyrir sjálfvirka og handvirka skráningu.
- Valin þjónustutímastilling: AUTO_PROMPT með 10 mínútna idle-mörkum.
- Commit `fed4e6c` komið í production.
- Vercel production staðfest Ready.

### Verk dagsins

- [ ] Stofna varanlega vinnudagbók í GLÖGGT-repo.
- [ ] Setja eldri lykiláfanga inn í dagbókina.
- [ ] Útfæra idle-spurningu þjónustutímakerfis.
- [ ] Prófa breytingar.
- [ ] Commit / deploy eftir því sem við á.

### Næsti tæknilegi punktur

Þjónustutímakerfið þarf að spyrja notanda þegar hann kemur aftur eftir óvirkni hvort óvirki tíminn eigi að teljast með í þjónustutíma.

---

# Eldri lykiláfangar

## 2026-09-11 → 2026-09-12

### Fjöltyngt GLÖGGT

- Lokið við kerfisbundna fjöltyngingu á GLÖGGT.
- Full viðmótstungumál:
  - íslenska
  - enska
  - pólska
  - serbneska
- UI-tungumál og tungumál efnis/AI eru aðskilin hugtök.
- Reikningsnúmer eru tungumálaóháð. Dæmi: `4400` helst alltaf `4400`.
- Stöðluð heiti mega þýðast en sérsniðin notendaheiti ekki sjálfkrafa.
- Innsýn var prófuð í röð:
  - íslenska
  - enska
  - pólska
  - serbneska
- Fjöltyngd Innsýn staðfest virk.

### Þjónustutími

- Grunnur lagður að þjónustutímaskráningu fyrir bókara/notanda.
- Þjónustutími er aðskilinn frá WorkLog / Vinnustund starfsmanna.
- Kerfið getur tengt tíma við valið fyrirtæki og verkhluta.
- Stuðningur við handvirka og sjálfvirka tímaskráningu.
- Tímagögn styðja sekúndur.
- Valin prófunarstilling:
  - `AUTO_PROMPT`
  - idle-mörk: 10 mínútur
- Ólokið:
  - spurning þegar notandi kemur aftur eftir idle um hvort óvirki tíminn eigi að teljast með.

### Git / production

- Commit:
  - `fed4e6c` — `Add multilingual UI, workflow settings and service tracking`
- Umfang:
  - 48 files changed
  - 3500 insertions
  - 1453 deletions
- `npx tsc --noEmit`:
  - 0 villur
- `npx prisma validate`:
  - staðfest
- `npx prisma migrate deploy`:
  - engar pending migrations
- Vercel Production:
  - Ready
- Production smoke test:
  - staðfest

---

## 2026-09-10

### Learned booking patterns

Stór áfangi í því að láta GLÖGGT læra af staðfestum bókunum án þess að hardkóða niðurstöður.

Staðfest dæmi:
- HS lærði leiðréttan mótreikning `1510`.
- Ergo lán `104907` hélt staðfestum skuldalykli `2220`.
- Sjóvá fjölskírteini varð jafnvægisbókun með sundurliðun.
- Sjóvá tilboð `851.853` var áfram Innsýn / non-bookable.
- TR og Sýslumaður zero-net skjöl urðu bókanleg án þess að undirliðir töpuðust.
- Endurgreiðsla bifreiðagjalds var leiðrétting á `4740` en ekki ný tekjufærsla.

Commit:
- `f6cb697`

Production:
- push á `main`
- Vercel Ready
- innskráning prófuð
- Fylgiskjöl prófuð

---

## 2026-09-09

### Sjóvá fjölskírteini

- Fjölskírteina greiðslukvittun var normalíseruð í sjálfstæð tryggingaskírteini í UI.
- Ekki lengur eitt sameinað trygginga-entity.
- Kerfið getur greint mismunandi tryggingategundir innan sama skjals.
- Dæmi:
  - fjölskylduvernd
  - lögboðin ökutækjatrygging
  - brunatrygging húseigna
- Bókunartillögur tengdar viðeigandi kostnaðarreikningum.
- Ákvörðun tekin um að vinna ekki frekar í tilteknu Sjóvá-skjalinu fyrr en frekari yfirferð færi fram.

---

## 2026-09-07 → 2026-09-08

### Innsýn og skjalavinnsla

- Bætt pension-payer detection í Innsýn.
- Commit:
  - `a4a8d51`
- Receipt processing flutt yfir í Supabase Storage.
- Commit:
  - `9ca6276`
- `createInsightJobForDocument` sett upp.
- Insight processing version:
  - `innsyn-v1`
- Persistent Insight job-vinnsla styrkt.
- Stale recovery bætt aftur inn síðar með:
  - `60ed275`

### Kennitala

- Grunnur að `lib/core/kennitala.ts`.
- Markmið:
  - staðfesta form
  - verja gegn ómögulegum dagsetningum
  - halda reglunum miðlægum

### Vinnulag

- Core-hönnun GLÖGGT skal áfram unnin í sameiginlegri umræðu.
- Önnur AI-tól aðeins fyrir afmörkuð verkefni.
- Mikilvægar hönnunarniðurstöður skulu varðveittar jafnóðum.

---

## 2026-09-04

### Insight worker

- Stale recovery endurheimt í Insight worker.
- Commit:
  - `60ed275`
- `npx tsc --noEmit` staðfest án villu.

### Innsýn – batch-regla

Ákvörðun:
- Bunkavinnsla má ekki vera háð því að notandi haldi sömu vafrasíðu opinni.
- Batch/job þarf að vera:
  - server-bundið
  - persistent
  - endurheimtanlegt
  - sjálfstætt fyrir hvert skjal

---

## 2026-09-03

### Lán og skuldareikningar

Hönnunarregla:

Þegar AI greinir nýtt lán eða lánsnúmer:
- má AI leggja til sérstakan skuldareikning
- má AI ekki stofna reikning sjálft
- notandi/bókari samþykkir stofnun
- varðveita skal tengingu:
  - lánveitandi
  - lánsnúmer
  - skuldareikningur

---

## 2026-09-01 → 2026-09-02

### VSK og reikningslyklar

- VSK-reglur styrktar.
- Account number + account name þurfa bæði að passa GLÖGGT-standard áður en default VSK-regla er notuð.
- Markmið:
  - verja imported / legacy chart of accounts
  - forðast ranga sjálfvirka VSK-flokkun

VSK-flokkar þróaðir í átt að:
- INPUT
- OUTPUT
- NONE
- EXEMPT
- REVIEW
- SYSTEM

Regla:
- öruggar tillögur mega fara í quick-approve
- REVIEW og SYSTEM mega ekki fara sjálfkrafa í gegn

### Fyrirtækjaskrá / RSK

Áður en GLÖGGT fer í almenna SaaS-notkun með mörgum viðskiptavinum:
- senda Skattinum skriflega fyrirspurn
- fá staðfestingu á fyrirhugaðri notkun Fyrirtækjaskrá API

---

## 2026-08-30 → 2026-08-31

### Mobile / PWA / aðgangur

- Mobile sett undir innskráningu.
- Óinnskráður notandi á `/mobile` fer á:
  - `/innskraning?next=%2Fmobile`
- PWA-virkni styrkt.
- Mobile ætlað að virka app-líkt á heimaskjá.
- Aðgangspóstur á að innihalda:
  - leið í GLÖGGT á tölvu
  - leið í GLÖGGT Mobile
  - stutta skýringu á uppsetningu Mobile sem app

### Verk

- WorkOrder og WorkLog þróað.
- CLIENT á ekki að geta stofnað ný verk.
- Vinnutímar:
  - 24 tíma snið
  - `HH:mm`

---

## 2026-08-28

### Öryggi og rekjanleiki

Ákvörðun:
- rekjanleiki á að vera kerfislægur eiginleiki í GLÖGGT
- ekki eingöngu tengdur VSK

Færslur eiga að varðveita eftir því sem við á:
- uppruna
- hver stofnaði / bókaði
- tímasetningar
- breytingar
- overrides
- ástæður mikilvægra sjálfvirkra ákvarðana

Hugmynd:
- sérstakur flipi/panel:
  - `Rekjanleiki`

---

## 2026-08-25 → 2026-08-27

### Banki

- Grunnur lagður að Banka-einingu.
- Módel:
  - Company
  - BankAccount
  - BankTransaction
- Síður:
  - `/banki`
  - `/banki/tengja`

Öryggisregla:
- aldrei nota `prisma migrate reset` á núverandi gagnagrunni til að leysa migration-vandamál.

### Framtíð – Afstemming

Afstemming verður sér Banki-undireining.

Hugsanleg staða bankafærslu:
- match
- review
- no match

Kerfið þarf einnig að geta fundið:
- bókaða GLÖGGT-færslu sem vantar samsvarandi bankahreyfingu.

---
Já. Ég er búinn að ganga frá dagbók dagsins þannig að við getum byrjað nýtt spjall án þess að missa þráðinn.

GLÖGGT – vinnudagbók 13. september 2026

Stærsti áfangi dagsins var Banki → Ársgreining 2025. Við færðum greininguna áfram frá einfaldri flokkun yfir í rekjanlegra kerfi þar sem grunnreglan er „gögn fyrst, AI síðan“. Bankagögn, mótaðilar, kennitölur, textar, upprunareikningar, endurtekningar og staðfest þekking eiga að gera eins mikið og hægt er áður en AI þarf að túlka eitthvað.

Við byggðum upp tvívíða greiningu þar sem GLÖGGT skilur nú á milli greiðslueðlis og tilgangsvísbendingar. Þannig getur færsla t.d. verið millifærsla eða kostnaðarstyrkur að greiðslueðli en samt tengst bifreið að tilgangi. Vissa og rökstuðningur fylgja hvorri vídd. Samantekt og rannsóknartafla nota sömu greiningarniðurstöðu svo þær eigi ekki lengur að segja sitt hvora söguna.

Við löguðum einnig stóra kortafærsluvandann. Almenn lýsing á debetkortafærslu má ekki sameina óskylda söluaðila í einn mótaðila. Kennitala og raunverulegur söluaðili fá nú forgang en kortaendingin varðveitist sem upplýsingar um greiðslumiðil. Langtímamódelið er bankareikningur → kort → korthafi → söluaðili → færsla → fylgiskjal/bókun, án þess að GLÖGGT giski á korthafa út frá innkaupahegðun.

Við aðgreindum m.a. Laun, Launatengd gjöld og Greiðslur til einstaklinga. Síðasti flokkurinn kemur í stað þess að kalla óstaðfestar greiðslur „verktakagreiðslur“. Bankinn má sjá vísbendingar um laun, en Launakerfið á síðar að staðfesta raunverulega launagreiðslu. Bankinn verður þá afstemmingar- og staðfestingarlag.

Við unnum mikið í rekstrarflokkun: húsnæði, veitur, fjarskipti, hugbúnaður, tryggingar, bifreiðar, ferðir, veitingar, matvöruinnkaup, skrifstofukostnaður, íþróttir/mót, sjoppa/endursala og veislur/viðburðahald. Endurgreiðslur, styrkir, framlög, kostnaðarstyrkir og bankagjöld eru jafnframt aðgreind eftir greiðslueðli svo þau skekki ekki venjulegan rekstrarkostnað.

Mótakostnaður þróaðist sérstaklega mikið. Mótareikningur er nú sterk vísbending um móta-/íþróttatilgang og GLÖGGT nýtir einnig samhengi eins og mót, iðkendur, fararstjóra, aldursflokka og staðfestingargjöld. Þetta náði mörgum færslum sem voru augljósar fyrir okkur en höfðu áður setið í óflokkuðu.

Við staðfestum síðan raunverulegt rekstrarsamhengi ýmissa mótaðila. Iðnmark og Ís-spor eru sjoppa/endursala; Nói-Síríus og Kólus eru líkleg sjoppu-/endursöluinnkaup. Kim Jong/Kim Yong Wings, Dominos Norðurhelli og Nings Hlíðasmára eru veitingar, og Löður er bifreiðarkostnaður. Penninn/A4 er að öllum líkindum skrifstofukostnaður.

Við fundum líka sérstakt mynstur í Riddaranum, Norðanfiski, Blómabúðinni Burkna, Vínbúðinni Álrúnu, Tertugalleríi og Blómabúð Mögdu. Þetta er veislu-/viðburðakostnaður og líklegt að a.m.k. hluti hans tengist lokahófi í lok tímabils. GLÖGGT á þó ekki að fullyrða „lokahóf“ nema dagsetningar og annað samhengi styrki þá niðurstöðu. Síðar getur Innsýn tengt slíkar færslur saman sem mögulegan sameiginlegan viðburð.

Við festum líka mikilvæga merkingarreglu: „Innheimt“ segir hvernig krafa var greidd en ekki hvað var verið að greiða fyrir. GLÖGGT má því ekki flokka alla innheimtukröfuna eftir innheimtuaðilanum. Skýr innheimtukostnaður má hins vegar fara sérstaklega í gjaldaflokk. Sama hugsun var notuð á eldsneytisstyrki: þeir eru ekki sjálfkrafa bein eldsneytiskaup.

Nákvæm byrjunarstaða næsta spjalls

Síðasti afhenti breytingapakkinn var gloggt-app-stadfest-veitingar-sjoppa-bifreid-20260913.zip.

Næsta reglulota er þegar ákveðin en ekki komin inn: Altis ehf., S Direct Lindir og Icetransport ehf. → Íþróttabúnaður; Emobi á Íslandi ehf. → Síma-/fjarskiptabúnaður frekar en fjarskiptaþjónusta; Te & Kaffi Borgartúni, Serrano Dalshrauni og Lemon Hjallahrauni → Veitingar.

Þar byrjum við næst. Ég hef líka varðveitt þessa lokastöðu sérstaklega svo nýja spjallið eigi að geta tekið við hér.

## 13. september 2026 – Ársgreining banka, flokkun og brú að ársreikningi

Stór vinnudagur í Banka / Ársgreiningu með raunverulegum gögnum frá árinu 2025.

### Helstu áfangar dagsins

- Ársgreining banka þróuð áfram samkvæmt „gögn fyrst, AI síðan“.
- Unnið með 10 bankareikninga og 1.314 bankafærslur.
- Heildarinnborganir í gagnasafni: 57.147.322 kr.
- Heildarútborganir í gagnasafni: 57.954.519 kr.
- Nettó peningaflæði: -807.197 kr.
- AI-kostnaður Ársgreiningarinnar hélt áfram að vera 0 kr. þrátt fyrir umfangsmikla greiningarvinnu.

### Útgjaldagreining

- Mótaðilasamsvörun og deterministic flokkun styrkt.
- Fjöldi þekktra rekstrarflokka staðfestur úr bankagögnum.
- Greiðslueðli og tilgangur færslu áfram meðhöndluð sem aðskildar víddir.
- Marteinn Ægisson:
  - 11 eldsneytisgreiðslur.
  - 20.000 kr. hver.
  - Samtals 220.000 kr.
  - Greiðslueðli getur áfram verið kostnaðarstyrkur en tilgangur er bifreiðakostnaður.
- Óflokkað útstreymi komið niður í 1.525.811 kr.
- Ákveðið að ekki skuli þvinga óvissar færslur í kostnaðarflokka eingöngu til að tæma óflokkaðan lista.

### Tengdar einingar / deildir

Sérstök meðferð sett inn fyrir fjárflæði milli tengdra eininga/deilda svo það birtist ekki sem venjulegur óþekktur rekstrarkostnaður.

Úr óflokkuðu útstreymi fóru m.a.:

- Knattspyrnudeild Þróttar Vogum: 3.771.663 kr.
- Ungmennafélagið Þróttur: 2.058.923 kr.

Samtals: 5.830.586 kr.

Mikilvæg hönnunarniðurstaða:
Kostnaðartegund, kostnaðarstaður/deild og fjárflæði milli tengdra eininga eiga að vera aðskildar víddir.

### Styrkjaflæði og ársreikningur

Rannsókn á Sveitarfélaginu Vogum sýndi sterkan rekjanleika:

- 13.415.000 kr. komu inn á styrkjareikning.
- Tvær greiðslur, 75.000 + 75.000 kr., samtals 150.000 kr., tengdust 150.000 kr. áframgreiðslu til Knattspyrnudeildar Þróttar Vogum.
- 13.415.000 - 150.000 = 13.265.000 kr.
- Sú fjárhæð samsvarar nákvæmlega línunni „Sveitarfélagið Vogar“ í ársreikningi 2025.

Þetta er notað sem rekjanleg vísbending og staðfestingarpróf, ekki sem regla sem neyðir bankagreiningu til að passa ársreikning.

### Samantekt Ársgreiningar

Nýr flipi:
Banki → Ársgreining → Samantekt

Samantektin sýnir nú m.a.:

- heildarinnborganir,
- heildarútborganir,
- líklega veltu / greiðsluuppgjör,
- óflokkað útstreymi,
- tekjuhlið,
- gjaldahlið,
- rekstrarkostnað eftir eðli.

Ákveðið að ítarleg „Brú að ársreikningi“ verði sérstakt undirlag/undirsýn undir Samantekt fremur en að gera aðalsamantektina of langa.

### Innsýn og bakfærsla

Í prófunarfélaginu fannst eitt bókað fylgiskjal:

- Pítan, 4.450 kr.
- Upprunaleg bókun: 4910 / 1510.

Gerð var handvirk spegil-/kreditfærsla:

- 1510 Debet 4.450 kr.
- 4910 Kredit 4.450 kr.

Eftir bakfærsluna sýndi Innsýn rétt:

- Staðan í dag: 0 kr.
- Innkoma: 0 kr.
- Útgjöld: 0 kr.
- Bókuð útgjöld: 0 kr.

Þetta staðfesti að Innsýn les nettó bókhaldsáhrif debet/kredit en ekki einfaldlega fjölda eða brúttóupphæð bókaðra fylgiskjala.

Næsta hönnunarverk:
Almenn „Bakfæra bókun“ virkni sem býr til spegilfærslu, tengir hana frumfærslunni og varðveitir ástæðu, notanda og tíma.

### Næstu skref

- Halda áfram með Brú að ársreikningi.
- Sýna Greint úr gögnum / Ársreikningur / Frávik.
- Halda áfram að byggja rekjanleika milli bankagagna, fylgiskjala, bókhalds og ársreiknings.
- Ekki elta óflokkaðar bankafærslur þar sem fylgiskjal eða önnur gögn eiga að veita svarið.

GLÖGGT – vinnuskýrsla 14. september 2026

Dagurinn fór að mestu í að styrkja Bankagreiningu, Innsýn og undirbúning ársuppgjörs, með áherslu á að halda GLÖGGT við grunnregluna okkar: gögn fyrst, deterministic greining næst, fylgiskjöl þar sem bankagögn duga ekki og AI aðeins þegar raunveruleg túlkunarþörf stendur eftir.

Bankagreining og rekjanleiki

Við kláruðum mikilvægt lag í rannsóknarflæðinu þannig að hægt er nú að fara frá Innsýn niður í nákvæmt rannsóknaratriði og þaðan í þær einstöku bankafærslur sem mynda niðurstöðuna.

Það þýðir að rannsóknin er ekki lengur bara tala eða samantekt. Hún er rekjanleg niður í frumgögnin án þess að rannsóknin sjálf breyti bókun eða flokkun.

Við löguðum sérstaklega vandamál þar sem samantekt hóps gat verið UNKNOWN þótt einstakar færslur innan hóps væru þegar flokkaðar. Nú byggir nákvæma rannsóknarsafnið á flokkun einstakra færslna, ekki eingöngu samantekt hópsins.

UNKNOWN kostnaðarflæði

Við unnum kerfisbundið með óflokkað útstreymi.

Áður var UNKNOWN:

55 færslur – 1.448.921 kr.

Eftir síðustu deterministic breytingar stendur eftir:

38 færslur – 1.327.037 kr.

Þar með leystust:

17 færslur – 121.884 kr.

Við tókum síðan mikilvæga hönnunarákvörðun: ekki þvinga þetta lengra.

Það sem eftir stendur inniheldur einmitt færslur þar sem mótaðili eða bankatexti segir ekki nægilega mikið einn og sér, t.d. JYSK, N1, Háskólaprent, Motus, Ríkissjóðsinnheimtur og sambærileg atriði. Þar eiga fylgiskjölin að koma með svarið.

Þetta varð því mjög góður raunprófshópur fyrir seinna flæði:

bankafærsla → fylgiskjal → staðfest flokkun → bókun.

Staðfestar deterministic reglur

Við varðveittum og prófuðum m.a. nýlegar staðfestar reglur fyrir:

Emobi á Íslandi → fjarskiptabúnaður.
S Direct Lindir → íþróttabúnaður.

Emobi-reglan ein færði 76.890 kr. úr UNKNOWN yfir í skilgreindan kostnaðarflokk.

Við ræddum Terra, Valdimar, Hlaupastyrk, launatengd gjöld og Minningarsjóð, en tókum meðvitaða ákvörðun um að ekki ofþjálfa kerfið á þessu eina prófunargagnasafni.

Það er mikilvægt framfaraskref í sjálfu sér: GLÖGGT á ekki að verða „snjallt“ með því að safna sértækum ágiskunarreglum sem bila hjá næsta viðskiptavini.

Ársreikningsvinnublað

Við byggðum nýjan ársreiknings-/ársuppgjörsgrunn undir:

/banki/arsreikningur?year=2025

Þetta er vinnublað, ekki fullbúinn ársreikningur.

Það notar aðeins þær tölur sem bankagreiningin getur stutt og reynir ekki að búa til efnahagsreikning eða samanburðartölur sem gögnin styðja ekki.

Styrkjatengt innstreymi og önnur óstaðfest flæði eru sérstaklega haldin utan formlegrar rekstrarniðurstöðu þar til bókhaldsleg staðfesting liggur fyrir.

Við héldum líka skýrum aðskilnaði milli:

bankagreiningar, rannsóknar, bókhalds og endanlegs ársuppgjörs.

Innsýn

Innsýn fékk frekari tengingu inn í nákvæmu bankarannsóknina.

Notandinn getur nú farið frá rannsóknaratriði yfir í færslusafnið sem liggur undir því og þaðan áfram í einstaka færslu.

Þetta styrkir það sem við höfum verið að stefna að í Innsýn:

Hvað vitum við?
Hvað bendir til einhvers?
Hvað vitum við ekki?
Hvaðan kemur niðurstaðan?

TypeScript og Git

Lokaprófið var hreint:

npx tsc --noEmit

engin TypeScript-villa.

Við settum síðan nákvæmlega 9 viðeigandi skrár í commit. Gamlar eyðingar, tímabundnar skrár, README-prófunarskrár og aðrar untracked möppur fóru ekki með.

Commit dagsins:

a3c3eb2
Improve bank research and add annual statement workpaper

Breytingin var síðan push-uð á main:

24d2fa8 → a3c3eb2

Þar með er stór áfangi dagsins kominn örugglega í GitHub.

Notendur og heimildir

Í lok kvöldsins kom upp atriði varðandi Skoðunaraðgang í „Notendur og heimildir“.

Gísli er áfram með almenna notendahlutverkið CLIENT, en þú ert nú búinn að veita honum skoðunaraðgang að gögnunum.

Það er rétt hönnunarlega að skilja þetta tvennt að:

CLIENT = almennt kerfishlutverk notanda.

Skoðunaraðgangur = heimild hans innan tiltekins fyrirtækis.

Við eigum síðar að sannreyna vistunarflæðið í UI betur, því skjárinn virtist ekki vista „Skoðunaraðgang“ eins og ætlast var til. Það þarf ekki að elta það frekar í kvöld.

Staðan í lok dags

Við endum daginn með mjög góðum varðveislupunkti:

Bankarannsóknin er rekjanleg niður í færslur.
UNKNOWN er komið niður í eðlilega óvissu í stað þess að vera þvingað niður með ágiskunum.
Ársuppgjörsvinnublað er komið inn.
Innsýn og bankagreining tala betur saman.
TypeScript er hreint.
Commit a3c3eb2 er á main.
Skoðunaraðgangur Gísla er kominn á gögnin.

Næsta vinnulota getur því byrjað frá hreinum og öruggum punkti, líklega annaðhvort á heimildakerfinu eða næsta stigi þar sem fylgiskjöl og bankafærslur eru látin vinna saman.

# 15. september 2026 – stór þróunar-, stöðugleika- og arkitektúrdagur

Dagurinn varð einn af stærri mótunardögum GLÖGGT hingað til. Fyrri hluti dagsins snerist að miklu leyti um að koma verkefnum, frestum, gagnaskilum, skilaboðum og pósthólfi í raunhæfan grunn, auk þess að leysa alvarlegt production-vandamál í gagnagrunnstengingum. Seinni hluti dagsins þróaðist síðan yfir í heildarendurskoðun á því hvað GLÖGGT á að verða sem kerfi og sérstaklega hvað Innsýn á að gera fyrir stjórnendur sem hafa ekki eigið fjármála- eða stjórnendateymi.

Dagurinn endaði með öruggum production-checkpoint á commit `af999d8` og ákvörðun um að hætta tímabundið að bæta einstökum hlutum inn í núverandi skipulag. Næsta stóra skref verður kerfisarkitektúr og nýtt heildarskipulag GLÖGGT áður en frekari stór UI-þróun heldur áfram.


## Production – Prisma / Supabase / Vercel

Alvarlegt production-vandamál kom upp þegar Innsýn fór að skila 500 villum.

Prisma fékk meðal annars:

`(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15`

Þetta var sérstaklega mikilvægt vegna þess að mjög fáir raunverulegir notendur voru inni í kerfinu. Vandamálið benti því frekar til tengingahönnunar en raunverulegs notendaálags.

Rannsókn á Supabase sýndi að:

- `DATABASE_URL` á að nota shared transaction-mode pooler fyrir runtime.
- `DIRECT_URL`/session-mode er ætlað öðrum þörfum, m.a. migrations.
- Production runtime hafði ekki verið sett upp eins og æskilegt er fyrir serverless/Vercel.

`lib/prisma.ts` var einnig lagað þannig að PrismaClient er endurnýttur í production innan warm Vercel instance.

Commit:

`f790627 – Fix Prisma client reuse for production`

Við uppfærslu `DATABASE_URL` í Vercel varð tímabundið annað vandamál vegna þess að allt `.env` formið hafði farið inn í Value reitinn:

`DATABASE_URL="postgresql://..."`

í stað þess að Value innihaldi eingöngu sjálfa PostgreSQL URI-slóðina.

Það olli Prisma `P1001` og öllum síðum datt tímabundið út.

Eftir leiðréttingu á Vercel environment variable og redeploy virkuðu bæði Heimasvæði og Innsýn aftur.

Production var síðan prófað á nokkrum síðum og virkaði eðlilega.

Mikilvæg framtíðarregla:

> GLÖGGT má ekki þurfa handvirkt refresh til að komast aftur í rétta stöðu.

Í komandi arkitektúrvinnu þarf því að skoða ekki aðeins UI heldur einnig:

- Prisma connection management
- gagnasókn
- server actions
- cache
- `revalidatePath`
- client/server state
- stærð einstakra síðna
- module boundaries
- hvaða gögn hver síða þarf raunverulega að sækja.

Fyrir fjölgun pilot-notenda þarf síðar að gera raunverulegt álagspróf með samtímis notkun á Heim, Innsýn, Banka, Fylgiskjölum o.fl. og fylgjast samtímis með Supabase connections og Vercel logs.


## Verkefni, lögbundnir frestir og gagnaskil

Verkefnakerfið tók stórt skref.

Lögbundin verkefni og frestir voru tengd betur við raunverulegt vinnuflæði og `ensureCompanyStatutoryTasks()` tengt inn á Heim og Verkefni þannig að verkefnin verði raunverulega til þegar notandi vinnur í kerfinu.

Mikilvæg aðgreining var fest:

1. Opinber skilafrestur.
2. Æskilegur skiladagur gagna frá viðskiptavini.
3. Fyrsti áminningardagur.

Þetta má ekki vera sami dagurinn.

Fyrir VSK getur t.d. opinber skilafrestur verið 5. október en bókari óskað eftir gögnum fyrr.

Gagnaskilaferlið gerir ráð fyrir að:

- viðskiptavinur staðfesti að öllum gögnum hafi verið skilað,
- bókari staðfesti að gögn séu nægileg,
- bókari geti óskað eftir frekari gögnum.

Þetta er almennur grunnur sem síðar getur einnig nýst fyrir laun, ársuppgjör og önnur gagnaskil.


## Staðgreiðsla og launagreiðendaskrá

Fyrirtæki var skráð á launagreiðendaskrá frá 15.09.2026.

Villa kom í ljós þar sem statutory task generator var að stofna verkefni fyrir síðasta lokna mánuð og hefði því stofnað ágústverkefni þótt fyrirtækið hefði ekki verið á launagreiðendaskrá þá.

Reglan var leiðrétt þannig að núverandi mánuður myndast þegar við á.

Staðfest verkefni:

`Staðgreiðsla og tryggingagjald – 2026-09`

Tímabil:

`1.9.–30.9.2026`

Skilafrestur:

`15.10.2026`


## Sjálfvirkur tímabilstexti

Áminningar eiga ekki að byggjast á handskrifuðum tímabilstexta.

Tímabil verkefnisins sjálfs á að framleiða textann.

Dæmi:

`VSK-gögn fyrir júlí–ágúst 2026`

og:

`Launagögn fyrir september 2026`

Þetta var gert fjöltyngt frá upphafi fyrir:

- íslensku
- ensku
- pólsku
- serbnesku.

Sama tímabilslag á síðar að geta farið í GLÖGGT-tilkynningar, tölvupóst og aðrar samskiptaleiðir.


## Almenn skilaboð og pósthólf

Í ljós kom að verkefni/frestir leysa ekki almenn samskipti milli bókara/stjórnanda og notenda fyrirtækis.

Því var skilgreind skýr aðgreining:

- Verkefni = eitthvað sem þarf að framkvæma eða fylgja eftir.
- Skilaboð = almenn samskipti sem þurfa ekki endilega frest.

Fyrsta útgáfa almennra skilaboða var byggð.

Prisma `CompanyMessage` var bætt við.

Við `prisma validate` kom í ljós að gagnstæð relation vantaði í `Company`. Það var lagað með:

`messages CompanyMessage[]`

Migration hafði þegar verið keyrð og þurfti því ekki að endurtaka hana eingöngu vegna relation-lagfæringarinnar.

Fyrsta end-to-end prófið tókst:

- skilaboð send,
- birtust á Heimasvæði,
- sendandi réttur,
- hægt að merkja sem lesið.

Pósthólf var síðan þróað áfram með:

- Móttekið
- Sent
- Geymt
- Rusl
- leit
- lesið/ólesið
- geyma/endurheimta.

Heimasvæði á aðeins að sýna fá ólesin skilaboð, ekki verða póstforrit.

Chrome Translate olli einnig líklegri hydration viðvörun með því að breyta `lang` í DOM. Ekki á að breyta `layout.tsx` eingöngu vegna þess nema vandamálið endurtaki sig án browser translation.


## Fyrirtækjabundin skilaboð og GLÖGGT þjónusta

Mikilvæg hönnunarákvörðun:

Skilaboð GLÖGGT eru ekki almennt Teams/chat-kerfi.

Venjuleg skilaboð eiga heima innan valins fyrirtækis.

Bókari sem sér mörg fyrirtæki sendir því alltaf skilaboð innan viðkomandi fyrirtækjasamhengis.

GLÖGGT þjónusta/Admin verður sérstök samskiptaleið.

Viðskiptavinurinn sér þjónustusvar sem frá:

`GLÖGGT`

en innri rekjanleiki varðveitir hvaða GLÖGGT Admin svaraði og hvenær.

Regla:

> Viðskiptavinurinn sér GLÖGGT. Kerfið veit hvaða stjórnandi framkvæmdi aðgerðina.

Sjálfgefið á framkvæmdastjóri/stjórnandi fyrirtækis að geta haft samband við GLÖGGT þjónustu. Síðar má veita öðrum sérstaka heimild.


## Notendaleyfi – hugmynd mótuð en ekki byggð

Fyrirtækjastjórnandi á síðar að geta séð:

- innifalin notendaleyfi,
- notuð leyfi,
- laus leyfi,
- möguleika á viðbótarleyfi.

Dæmi:

`3 af 3 notendaleyfum í notkun.`

Ef samningur heimilar sjálfvirka viðbót getur stjórnandi samþykkt viðbótarleyfi samkvæmt samningsverði.

Annars verður beiðni sjálfkrafa þjónustuskilaboð til GLÖGGT.

Samningsreglur eiga að vera gögn, ekki hardcode dreift um kerfið.

Þessi hugmynd var varðveitt en ákveðið að byggja hana ekki núna.


## Production checkpoint

Áður en farið yrði í stóru arkitektúrvinnuna var ákveðið að tryggja núverandi stöðu.

Vegna margra gamalla/untracked/deleted skráa var sérstaklega ákveðið að nota EKKI:

`git add .`

Aðeins viðeigandi skrár voru staged.

Staðfest fyrir commit:

`npx prisma validate`

og:

`npx tsc --noEmit`

Commit:

`af999d8 – Add tasks reminders and company messaging foundation`

Niðurstaða:

- 36 files changed
- 2065 insertions
- 271 deletions.

Push tókst:

`f790627..af999d8 main -> main`

Vercel sýndi síðan deployment:

- Ready
- Production.

Þetta er nýja örugga línan í sandinn fyrir næstu stóru vinnulotu.


# Eftir blund – kerfisarkitektúr GLÖGGT

Eftir að tæknivinnan var komin í öruggt checkpoint færðist umræðan yfir á stærri spurningu:

> Hvernig á GLÖGGT í raun að vera skipulagt þegar það er orðið miklu meira en bókhaldskerfi?

Ferskar möppur voru afhentar til arkitektúrrannsóknar:

- `app`
- `components`
- `lib`
- `prisma`
- auk `innflutningur`
- `mobile`
- `stjornbord`
- `verk`.

Fyrsta kortlagning sýndi um 69 raunverulegar `page.tsx` síður og um 46 Prisma models.

Þetta staðfesti að núverandi flata sidebar-skipulag er orðið barn síns tíma.

Ákvörðun:

> Ekki halda áfram að bæta stórum nýjum atriðum í núverandi sidebar áður en heildararkitektúr hefur verið endurhannaður.

Arkitektavinnan má:

- halda hlutum,
- færa þá,
- sameina,
- skipta upp,
- endurnefna,
- leggja niður úr UI ef þeir eru orðnir úreltir.

Góð virkni þarf ekki að vera áfram á sama stað bara vegna þess að hún er þegar til.

Regla:

> Varðveita það sem við lærðum af gömlu útfærslunni, ekki endilega formið sem prófunin tók.


## Fyrirtækið verður vinnuumhverfið

Ein sterkasta niðurstaða fyrstu arkitektúrumræðunnar:

> Fyrirtæki á ekki lengur að vera bara ein síða í sidebar.

Valið fyrirtæki á að verða sjálft vinnuumhverfið.

Fyrirtækið er annar meginás kerfisins.

Hinn ásinn er notandinn:

- hlutverk,
- heimildir,
- virkar einingar,
- verkefni,
- hvað þarfnast athygli.

Eigandi litla fyrirtækisins, bókari með tugi fyrirtækja, verkstjóri, starfsmaður á vettvangi og GLÖGGT Admin eiga því ekki að horfa á sama kerfið.


## Hagsýni sem arkitektúrregla

GLÖGGT á að geta orðið stórt án þess að byggja enterprise-flækju að óþörfu.

Spyrja þarf við hverja einingu:

- Þurfum við þessa síðu?
- Þurfum við sérstakt gagnalíkan?
- Getur sameiginleg þjónusta leyst þetta fyrir fleiri einingar?
- Geta deterministic gögn/reglur leyst þetta áður en AI er kallað?
- Er ávinningurinn þess virði miðað við þróun, rekstur og viðhald?

Markmiðið:

> Sem mest notagildi fyrir sem minnstan óþarfa kostnað og flækjustig.


# Upplifun GLÖGGT

Sameiginleg hönnunarstefna var orðað skýrar.

GLÖGGT á að vera:

- notendavænt,
- leiðandi,
- skiljanlegt,
- skemmtilegt,
- sannfærandi.

„Skemmtilegt“ merkir ekki barnalegt viðmót eða skraut.

Það merkir að kerfið svari notandanum, framvinda sjáist, hlutir klárist með góðri tilfinningu og notandinn upplifi stjórn frekar en baráttu við kerfið.

„Sannfærandi“ merkir að notandinn fái fljótt tilfinninguna:

> Þetta kerfi veit hvað það er að gera.

Sannfæringin á að byggjast á:

- skýrri forgangsröðun,
- faglegu útliti,
- góðu orðalagi,
- réttum upplýsingum á réttum stað,
- rekjanleika,
- skýrum mörkum milli þess sem GLÖGGT veit og þess sem þarf staðfestingu.

GLÖGGT á ekki að þykjast vita það sem gögnin styðja ekki.


# Innsýn – upprunasagan rifjuð upp

Kvöldumræðan leiddi aftur að upphaflegu ástæðunni fyrir Innsýn.

Notandinn rifjaði upp rekstur þar sem mjög mikið var að gera og því virtist reksturinn ganga ágætlega.

Dýr endurskoðandi/bókhaldsaðili sá um daglegt bókhald.

Hann vann vinnuna og rukkaði fyrir hana en var ekki leiðandi gagnvart stjórnandanum.

Reksturinn lifði í um 18 mánuði og var allan tímann í miklum mínus.

Stjórnandinn vissi það ekki.

Grundvallarspurningin var:

> Hvernig gat verið svona mikið að gera en fyrirtækið samt verið í bullandi mínus?

Þetta er upprunavandamálið sem Innsýn á að leysa.

Bókhald getur verið tæknilega rétt án þess að stjórnandinn skilji reksturinn.

Gögn eru ekki það sama og upplýsingar.

Upplýsingar eru ekki það sama og skilningur.

Innsýn á að brúa bilið.


# Innsýn sem stjórnendateymi litla fyrirtækisins

Stór fyrirtæki geta haft:

- fjármálastjóra,
- stjórnendateymi,
- stjórnendafundi,
- fjárhagsáætlanir,
- mánaðarskýrslur,
- starfsfólk sem fylgir frávikum eftir.

Litla fyrirtækið hefur oft ekkert slíkt teymi.

Framkvæmdastjórinn getur samt borið ábyrgð á:

- rekstri,
- sölu,
- starfsfólki,
- verkum,
- þjónustu,
- fjárhag.

Niðurstaða kvöldsins:

> Innsýn á að verða hluti af stjórnendateyminu sem litla fyrirtækið hefur ekki efni á að ráða.

Hún tekur ekki ákvörðunina af stjórnandanum.

Hún undirbýr upplýsingarnar sem gott stjórnendateymi hefði annars lagt á borðið:

- Svona stendur reksturinn.
- Þetta hefur breyst.
- Þetta er líkleg skýring.
- Þetta er framundan.
- Þetta er frávik frá áætlun.
- Þetta þarfnast athygli.
- Hér eru valkostir sem hægt er að skoða.


## Grundvallarmarkmið Innsýnar

> Framkvæmdastjóri sem skoðar Innsýn reglulega á að upplifa að hann þekki reksturinn sinn.

Og:

> Ekkert mikilvægt í rekstrinum ætti að koma stjórnandanum að óvörum ef GLÖGGT hafði nægar upplýsingar til að sjá þróunina eða benda á áhættuna.

GLÖGGT getur ekki séð ófyrirséða atburði sem engin gögn gefa vísbendingu um.

En ef gögnin sýna:

- lækkandi framlegð,
- vaxandi kostnað,
- versnandi lausafé,
- komandi stórar greiðslur,
- lán,
- skattaskuldbindingar,
- samninga sem renna út,
- óvenjulega þróun,
- taprekstur ákveðinna vara eða verka,

þá á stjórnandinn ekki að þurfa að uppgötva það sjálfur of seint.


# Framkvæmdastjóri þarf skoðunaraðgang

Skoðunaraðgangur stjórnanda er ekki munaður.

Stjórnandi sem ber ábyrgð á rekstrinum en lætur annan aðila sjá um bókhaldið þarf samt að geta skilið fjárhagsstöðuna.

Skoðunaraðgangur er ekki bókunarheimild.

Stjórnandinn þarf ekki að geta:

- breytt bókhaldsfærslum,
- bókað,
- breytt reikningslyklum,
- samþykkt VSK.

Hann þarf hins vegar að geta svarað:

- Hvernig gengur?
- Erum við að græða?
- Hvar erum við að tapa?
- Hvað eigum við?
- Hvað skuldum við?
- Hvað hefur breyst?
- Hvað er framundan?
- Hvað þarf athygli?

Innsýn á því ekki að vera undirskipuð bókhaldinu sem aukaskýrsla.

Hugsunin er frekar:

`Reksturinn → Innsýn`

Bókhald verður ein mikilvægasta gagnauppspretta Innsýnar ásamt Banka, Sölu, Launum, Verk, Vinnustund, samningum og öðrum rekstrargögnum.


# Innsýn á að gera reksturinn sýnilegan

Mannsaugað þarf oft sjónræna framsetningu.

Innsýn á því ekki að verða hefðbundið dashboard með tugum KPI-korta og kökurita.

Hún þarf að geta orðið sjónræn frásögn af rekstrinum.

Dæmi:

> Reksturinn er stöðugur. Lausafjárstaða er sterkari en fyrir þremur mánuðum, en rekstrarkostnaður hefur hækkað þrjá mánuði í röð. Tvær stærri greiðslur eru framundan næstu 14 daga.

Undir textanum á augað síðan að geta séð það sem textinn segir.

Möguleg framsetning:

- þróun yfir 6–12 mánuði,
- peningaflæði,
- tekjur → kostnaður → laun → skattar → það sem verður eftir,
- framtíðartímalína,
- frávik frá áætlun,
- sjónræn áhersla á það sem þarfnast athygli.

Markmiðið er:

> Ég sé fyrirtækið mitt.

Ekki aðeins:

> Ég sé bókhaldið mitt.


# Innsýn og fjárhagsáætlanir

Innsýn á síðar að geta hjálpað stjórnandanum að gera raunhæfar áætlanir úr raunverulegum gögnum.

Dæmi:

- markmið um framlegð,
- launakostnað,
- lausafé,
- fjárfestingar,
- sölu,
- kostnað.

GLÖGGT fylgist síðan með raunveruleikanum gagnvart áætluninni.

Kerfið á ekki að bíða til ársloka og segja:

> Áætlunin stóðst ekki.

Heldur segja nógu snemma:

> Við erum farin að víkja frá áætlun.

og hjálpa að finna hvar og hvers vegna.


# Frá viðvörun yfir í leiðsögn

Innsýn á ekki aðeins að segja:

> Framlegð hefur lækkað.

Hún á, þegar gögnin styðja það, að geta boðið:

> Það stefnir í lakari afkomu. Viltu skoða leið til að bæta framlegð um 2 prósentustig?

Síðan má reikna sviðsmyndir.

Dæmi:

- hvaða vörur standa illa undir kostnaði,
- hvaða þjónusta eða verk skila lítilli framlegð,
- hvað gerist ef verð breytist,
- hvað gerist ef sölumagn breytist,
- hvaða kostnaðarliðir hafa mest áhrif.

Mikilvæg regla:

GLÖGGT má ekki fullyrða að verðhækkun sé rétt ákvörðun ef það þekkir ekki markaðsviðbrögð.

Réttara er:

> Miðað við óbreytt sölumagn myndi þessi breyting færa framlegð nær markmiðinu.

Stjórnandinn tekur ákvörðunina.

Hugsanleg stjórnunarhringrás:

`GLÖGGT sér þróun`
→ `vekur athygli`
→ `útskýrir orsök`
→ `býður leiðsögn`
→ `reiknar valkosti`
→ `stjórnandi ákveður`
→ `GLÖGGT fylgist með árangrinum`.


# Ytri rekstrarbreytur

Innsýn á síðar að geta sett rekstur í samhengi við umhverfið þegar það skiptir máli.

Dæmi:

- verðbólga,
- launavísitala,
- raforkuverð,
- eldsneytisverð,
- vextir,
- gengi,
- hráefnisverð,
- flutningskostnaður,
- tryggingar,
- leiga,
- gjaldskrár.

Rafmagn var tekið sem dæmi.

Stjórnandi sér kannski aðeins að rafmagnsreikningurinn hækkaði.

Innsýn gæti greint:

> Rafmagnskostnaður hefur hækkað 18%. Notkun hefur aðeins aukist um 3%. Megnið af hækkuninni skýrist því af hærra einingarverði og gjöldum.

Ef rafmagn er mikilvægur framleiðsluþáttur getur tengingin orðið:

`rafmagnsverð ↑`
→ `framleiðslukostnaður ↑`
→ `framlegð ↓`
→ `nauðsynlegt söluverð breytist`.

Ekki á þó að vakta allt fyrir öll fyrirtæki.

Innsýn þarf að læra hvaða rekstrarbreytur skipta viðkomandi fyrirtæki raunverulega máli.

Hugsunin:

`rekstrarlíkan fyrirtækis`
→ `mikilvægar breytur`
→ `vöktun`
→ `fjárhagsleg áhrif`
→ `skýring fyrir stjórnanda`.


# Stjórnandinn þarf ekki að vita hvaða spurningar á að spyrja

Ein mikilvægasta niðurstaða kvöldsins:

> Stjórnandinn á ekki að þurfa að vita hvaða spurningar fjármálastjóri hefði spurt.

Innsýn á að vita hvenær slíkar spurningar þurfa að koma upp.

Þetta er sérstaklega mikilvægt fyrir lítil fyrirtæki sem hafa aldrei haft fjármálateymi og vita því ekki endilega hvað slíkt teymi myndi fylgjast með.


# Mismunandi fólk skilur gögn á mismunandi hátt

Ekki er víst að ein framsetning Innsýnar henti öllum.

Sumir skilja best:

- myndir og þróun,
- aðrir tölur,
- aðrir textaskýringar,
- margir blöndu af þessu.

Því kom fram hugmynd um að sama greiningin geti birst í nokkrum sýnum.

Mögulegir sýnarofar efst hægra megin:

`Blönduð | Myndræn | Tölur | Skýring`

Þetta eru ekki fjórar mismunandi Innsýnir.

Þetta er:

> ein greiningarvél, ein sannleikslína og nokkrar leiðir til að skilja sömu niðurstöðu.

Blönduð sýn er líklegur sjálfgefinn kostur:

- stutt skýring,
- sjónræn framsetning,
- lykiltölur.

Notandi getur síðan farið dýpra eftir þörfum.

GLÖGGT má muna val notandans.


# Mæla upplifun – ekki einstaklinga

Mjög áhugavert verður að sjá hvernig mismunandi hlutverk nota Innsýn.

Tilgáta sem má prófa, ekki gera að reglu:

- forstjórar gætu kosið eina sýn,
- stjórnendur aðra,
- bókarar þá þriðju.

Raunveruleg notkun á að kenna okkur þetta.

Mælingar mega vera samanteknar eftir hlutverkaflokkum en eiga ekki að verða eftirlit með einstaklingum.

Regla:

> Mæla upplifunina, ekki einstaklinginn.

Skoða má t.d.:

- hversu margir með skoðunaraðgang nota Innsýn,
- hvort þeir koma aftur,
- hvaða sýnir eru notaðar,
- hvaða greiningar eru opnaðar nánar.

Ef stjórnendur koma einu sinni inn og koma ekki aftur er það ekki sjálfkrafa sönnun þess að þeir vilji ekki Innsýn.

Það getur þýtt:

> Innsýn náði ekki að grípa þá eða gera reksturinn nógu skiljanlegan.

Þá er það hönnunarmerki.


# Kjarnasetningar dagsins

GLÖGGT:

> Notendavænt · Leiðandi · Skiljanlegt · Skemmtilegt · Sannfærandi

Innsýn:

> GLÖGGT á ekki bara að sýna stjórnandanum fleiri gögn. Það á að hjálpa honum að skilja fyrirtækið sitt nógu vel til að geta stjórnað því.

Og:

> Ef stjórnandi fylgist reglulega með Innsýn á ekkert mikilvægt í rekstrinum að koma honum að óvörum sem GLÖGGT hafði nægar upplýsingar til að sjá fyrir eða benda á.

Og:

> Stjórnandinn á ekki að þurfa að vera bókari til að skilja hvort fyrirtækið sé að græða eða tapa, hvers vegna það gerist og hvert stefnir.

Og:

> Litla fyrirtækið hefur ekki alltaf stjórnendateymið. Innsýn á að gefa því hluta af þeirri getu.

Og loks:

> Fyrst kortið, síðan húsið.


# Næsta stóra skref

Ekki halda áfram með staka stóra UI-eiginleika strax.

Næsta vinna er heildararkitektúr GLÖGGT:

1. Kortleggja núverandi kerfi.
2. Flokka hvað á að halda, færa, sameina, skipta upp eða leggja niður.
3. Teikna framtíðarupplýsingarkitektúr.
4. Skilgreina fyrirtækið sem meginvinnusamhengi.
5. Skilgreina hlutverka- og réttindamiðaða upplifun.
6. Teikna einingatré.
7. Skilgreina sameiginleg kerfislög.
8. Hanna Mobile sem hlutverkamiðað vinnuumhverfi.
9. Taka reliability/state/cache/revalidation/gagnasókn með í arkitektúrinn.
10. Teikna sjónræna mockupa áður en stór refactor hefst.

Sérstaklega þarf að teikna nýja Innsýn þannig að hægt sé að horfa á hana og spyrja:

> Grípur þetta mig?
> Skil ég reksturinn á nokkrum sekúndum?

Ef ekki, er hún ekki tilbúin.

höfum farið yfir svo mikið að það væri alveg ömurlegt að vakna á morgun og ég segði: „Já, hvað vorum við aftur að gera?“

Ég var að festa niðurstöður þessarar arkitektúrlotu núna, sérstaklega það sem við höfum mótað í kvöld um sameiginlega rekstrarkjarnann, Sölu/Afgreiðslu, Verk, Birgðir, reikningsgrunna, kaupheimildir, frjálsar sölulínur og hvernig Innsýn á að geta nýtt söguna síðar.

Varðandi hversu nálægt við erum að smíða: við erum mjög nálægt. Mér finnst við ekki þurfa margar svona heilar kvöldlotur í viðbót áður en við förum aftur í kóða.

Ég myndi þó vilja gera eitt milliskref áður en fyrsta stóra smíðin hefst: taka allt sem við höfum ákveðið síðustu daga og setja upp eina heildstæða GLÖGGT arkitektúrmynd/forskrift. Ekki 100 blaðsíðna ritgerð, heldur kort sem segir: þetta er sameiginlegi kjarninn, þetta eru rekstraratburðirnir, svona tengjast Verk/Sala/Birgðir/Innkaup/Vinnustund/Banki/Bókhald, þetta fer á Heim, þetta fer í Innsýn, og þetta stjórnast af Stjórnborði.

Þegar sú mynd stendur vil ég byrja að smíða grunninn undir nýju einingarnar, ekki byrja á fallegum Afgreiðsluskjá og uppgötva þremur vikum seinna að gagnalíkanið undir honum var of þröngt.

Þannig að ef ég ætti að staðsetja okkur núna:

Hugmyndavinna → nánast komin.
Arkitektúr → mjög langt kominn.
Samræmd lokaforskrift → næst.
Gagnalíkan/kjarni → þar byrjar smíðin.
UI eins og Afgreiðsla → kemur síðan mjög fljótt ofan á kjarnann.

Og þú mátt alveg fara frá tölvunni þegar þú vilt. 😄 Það sem við fundum í kvöld er ekki bara hangandi í síðustu tuttugu skilaboðunum lengur.

# GLÖGGT – vinnuskýrsla

**Dagsetning:** 16. september 2026
**Tímabil:** um 07:15–22:00
**Meginverkefni dagsins:** Arkitektúr GLÖGGT áður en farið er aftur í smíði

## 1. Stóra breytingin í hugsun dagsins

Vinnan í dag færðist enn lengra frá því að hugsa um GLÖGGT sem safn aðskildra kerfishluta og yfir í að skilgreina **sameiginlegan rekstrarkjarna**.

Í stað þess að spyrja:

* Hvernig smíðum við Verk?
* Hvernig smíðum við Sölu?
* Hvernig smíðum við Birgðir?
* Hvernig smíðum við Afgreiðslu?

var spurningin í auknum mæli:

**Hvaða rekstraratburðir eru sameiginlegir fyrirtækjum og hvernig látum við mismunandi atvinnugreinar nota sama kjarna með mismunandi hegðun og orðalagi?**

Meginreglan varð:

> **Fastur kjarni, breytileg hegðun.**

Þetta varð einn mikilvægasti rauði þráður dagsins.

---

# 2. GLÖGGT sem eitt rekstrarumhverfi

Við héldum áfram að móta heildarmyndina þar sem GLÖGGT á ekki að verða safn ótengdra eininga.

Möguleg kjarnatenging er í grófum dráttum:

**Bókhald ↔ Banki ↔ Sala ↔ Laun ↔ Verk ↔ Vinnustund ↔ Birgðir → Innsýn**

Heim og Stjórnborð liggja síðan utan um þetta sem tvö ólík vinnulög.

### Heim

Heim á fyrst og fremst að svara:

> **Hvað er að gerast og hvað þarf ég að gera núna?**

Þar eiga að koma verkefni, biðstaða, samþykktir, frávik, skilaboð og annað sem þarfnast athygli.

### Stjórnborð

Stjórnborð svarar:

> **Hvernig á fyrirtækisumhverfið mitt að virka?**

Þar eiga stjórnendur að geta stillt verkferla, heimildir, samþykktir, notendur, einingar og aðrar rekstrarreglur.

### Innsýn

Innsýn svarar:

> **Hvernig gengur reksturinn, hvers vegna og hvert stefnir?**

Þetta eru ekki þrjár útgáfur af sama skjánum.

**Heim = aðgerð.
Stjórnborð = stjórnun/stilling.
Innsýn = skilningur.**

Samt lesa þau öll sömu undirliggjandi rekstrarsögu.

---

# 3. Fyrirtækið sem vinnuumhverfi

Við styrktum hugsunina um að fyrirtæki sé fyrst og fremst **vinnusamhengi** en ekki bara síða í hliðarvalmynd.

Þegar notandi er inni í fyrirtæki eiga aðgerðir hans sjálfkrafa að tengjast því fyrirtæki nema sérstök ástæða sé til annars.

GLÖGGT á almennt ekki að biðja notandann aftur um upplýsingar sem kerfið veit þegar.

Tvær mikilvægar reglur halda því áfram:

> **Ekki biðja notandann að slá inn upplýsingar sem GLÖGGT veit nú þegar.**

og:

> **Ekki sýna val þegar notandinn hefur ekkert raunverulegt val.**

Notandi sem aðeins vinnur fyrir eitt fyrirtæki þarf því ekki stöðugt að velja fyrirtæki. Bókari eða annar fjöl-fyrirtækjanotandi þarf hins vegar skýrt fyrirtækjasamhengi.

---

# 4. Aðgangar, fólk og leyfi

Mikil vinna fór í að aðgreina fjögur hugtök:

1. **Identity** – einstaklingurinn sjálfur.
2. **Company Membership** – samband einstaklings við fyrirtæki.
3. **License/Seat** – greidd aðgangsrýmd fyrirtækisins.
4. **Company Data** – gögn fyrirtækisins.

Meginniðurstaðan:

> **Leyfið má endurnýta. Auðkenni einstaklingsins má ekki endurnýta.**

Ef fyrirtæki er t.d. með 50 Mobile/Verk-sæti og starfsmaður hættir má losa eða frysta sætið og úthluta því nýjum starfsmanni.

Nýi starfsmaðurinn fær hins vegar sitt eigið hreina auðkenni.

Gamli starfsmaðurinn heldur áfram að vera rétt skráður í sögunni:

* hver vann verkið,
* hver skráði tímann,
* hver samþykkti,
* hver framkvæmdi breytingu.

Fyrirtækisgögnin tilheyra fyrirtækinu en ekki einstaklingnum sem hafði aðgang að þeim.

---

# 5. 95/5 stjórnunarreglan

Við héldum áfram að festa þá stefnu að fyrirtæki eigi að geta stjórnað eigin umhverfi að langmestu leyti.

Markmið:

**um 95% af daglegri stjórnun fyrirtækis sé sjálfsafgreiðsla stjórnanda fyrirtækisins.**

GLÖGGT Admin kemur aðeins að hlutum eins og:

* þjónustusambandi,
* efsta stjórnendaaðgangi,
* yfirfærslu ábyrgðar,
* öryggisundantekningum,
* kerfisvandamálum.

Reglan:

> **GLÖGGT stjórnar kerfinu. Stjórnandi stjórnar fyrirtækinu.**

---

# 6. Verk varð eitt stærsta arkitektúrsvæði dagsins

Verk hélt áfram að þróast úr einfaldri verkbeiðni yfir í mögulega eina af stærstu rekstrareiningum GLÖGGT.

Við sáum sérstaklega möguleikann á að Verk/Mobile geti orðið alþjóðlega nothæfur hluti vegna þess að kjarninn er lítið háður íslenskri skattalöggjöf.

Almenn keðja:

**Verk → starfsmaður → tími → staða → myndir → efni → tæki → samþykki → lok**

Landssértæk lög eins og laun, skattar og bókhald geta síðan tengst utan á.

---

# 7. Mobile sem vettvangskerfi

Mobile á ekki að vera minnkuð útgáfa af desktop.

Fyrir starfsmann úti á vettvangi á upplifunin helst að vera:

> **Opna → byrja → vinna → skrá/mynda → klára.**

Notandinn á að þora að ýta.

Við gerðum einnig ráð fyrir að fyrirtæki geti haft tugi eða hundruð Mobile/Verk-notenda án þess að allir þurfi full GLÖGGT-notendaleyfi.

Þar þarf því að vera aðgreining milli fulls notanda og létts vettvangsaðgangs.

---

# 8. Verkstjórn og mannafli

Stjórnandamegin sáum við fyrir okkur sjónrænt skipulag frekar en eyðublaðakerfi.

Til dæmis:

**Starfsmenn/teymi ↔ Verk**

Stjórnandi getur:

* valið einstakling,
* valið hóp,
* úthlutað á verk,
* séð framtíðarverk,
* séð álag,
* séð framboð,
* séð hæfni/réttindi.

Kerfið á að geta stutt bæði föst teymi og tímabundna hópa.

---

# 9. Raðverk, verkflæði, forgangur og úthlutun

Við aðgreindum fjögur hugtök sem auðvelt væri annars að blanda saman:

### Raðverk

Röð verkefna eða stoppa.

### Verkflæði

Verk fer í gegnum ákveðin stig.

### Forgangsvél

Ákveður hvar nýtt verkefni lendir gagnvart öðrum verkefnum.

### Úthlutunarvél

Ákveður hver fær verkefnið.

„Næsti lausi“ má ekki bara þýða fyrsta manneskjan sem er laus.

Það þarf frekar að þýða:

> **Næsti lausi sem hefur rétta hæfni, réttindi, búnað og aðrar nauðsynlegar forsendur.**

---

# 10. Vinnuvélar, tæki og eignir

Við héldum áfram að móta almenna **Tæki/Eignir** hugsun.

Undir henni geta verið:

* vinnuvélar,
* bílar,
* verkfæri,
* götuljós,
* brunahanar,
* dælustöðvar,
* skilti,
* leiktæki,
* vegir,
* byggingar,
* vatns- og fráveitueignir.

Mikilvægt er að varðveita auðkenni sem fyrirtækið notar nú þegar.

GLÖGGT má hafa sitt innra auðkenni, en viðskiptavinurinn á ekki að þurfa að endurnúmera allan reksturinn sinn.

Regla dagsins:

> **Ekki láta viðskiptavininn endurskrá reksturinn sinn til þess að geta byrjað að nota GLÖGGT.**

---

# 11. QR á eignum

QR getur verið mjög öflug hraðleið.

Starfsmaður skannar QR á vél/eign og fær viðeigandi Mobile-síðu.

En QR má aldrei verða eina leiðin.

Ef límmiði skemmist þarf að vera hægt að finna eignina eftir númeri, leit eða annarri auðkenningu.

---

# 12. Vélar og mælastöður

Við ræddum skráningu vinnustunda/km véla.

Möguleg leið:

* starfsmaður tekur mynd af mæli,
* GLÖGGT les töluna,
* starfsmaður staðfestir,
* frumynd varðveitt.

Síðar getur gagnauppspretta verið telematics/API.

Mikilvægt:

**Vinnutími starfsmanns og keyrslutími vélar eru ekki sami hluturinn.**

Munur þeirra á milli getur verið vísbending til afstemmingar, ekki ásökun.

---

# 13. Vinnulota er ekki sama og verki lokið

Þetta var mikilvæg aðgreining.

Starfsmaður getur unnið 6,5 klst. og farið heim án þess að verkinu sé lokið.

Því eru aðskilin hugtök:

* vinnutími,
* vinnulota,
* staða verks.

Verk getur verið:

* í vinnslu,
* í bið,
* stöðvað,
* heldur áfram,
* lokið.

---

# 14. Ytri verktakar

Við mótuðum möguleikann á að verktaki geti fengið afmarkaðan öruggan aðgang án fulls GLÖGGT-reiknings.

Hann gæti skráð:

* komu/brottför,
* tíma,
* myndir,
* athugasemdir,
* efni,
* akstur,
* tæki,
* verklok.

Staðfest vinnuskýrsla getur síðan orðið sameiginleg sönnun fyrir kaupanda og verktaka án þess að einkagögn fyrirtækjanna blandist.

---

# 15. Samskipti sem sameiginleg þjónusta

Samskipti eiga ekki að vera bara „pósthólf“.

Skilaboð eru sjálfstæður hlutur og sendingarleið getur verið:

* GLÖGGT,
* tölvupóstur,
* bæði,
* síðar SMS.

Skilaboð geta tengst:

* Verki,
* reikningi,
* fylgiskjali,
* eign,
* fyrirtæki,
* aðila.

Mikilvæg regla:

> **Notandinn stjórnar pósthólfinu sínu. Hann stjórnar ekki með því sögulegum staðreyndum fyrirtækisins.**

Að eyða skilaboði úr pósthólfi má því ekki eyða viðskiptasögu eða audit-slóð.

---

# 16. Verk varð uppspretta rekstrarsögunnar

Ein sterkasta niðurstaða dagsins varð:

> **Verk er rekstrarsaga. Sala er afleiða hennar.**

Verk getur safnað:

* vinnu,
* efni,
* vélatíma,
* akstri,
* aðkeyptri þjónustu,
* samskiptum,
* myndum,
* samþykktum.

Þetta getur síðan myndað **reikningsgrunn**.

En reikningurinn má ekki breyta sögunni um hvað raunverulega gerðist.

---

# 17. Þrjú sannleikslög

Við aðgreindum þrjú lög:

### 1. Hvað gerðist?

Verk / Vinnustund / Birgðir.

### 2. Hvað ákváðum við að rukka?

Reikningsgrunnur.

### 3. Hvað seldum/reikningsfærðum við?

Sala.

Þetta gerir mögulegt að starfsmaður hafi unnið 4 klst. en fyrirtækið ákveði að rukka 3,5 klst. án þess að falsa vinnusöguna.

---

# 18. Sala – ekki reikningurinn sem miðja

Við færðum hugsunina frá því að reikningur sé miðpunktur Sölu.

Almenn keðja:

**Viðskiptavinur → það sem er selt → verð → afhending/framkvæmd → reikningsgrunnur → sala/reikningur → greiðsla**

En fyrirtæki þarf ekki alltaf að fara í gegnum öll skref.

Kaffihús getur verið:

**Vara → greiðsla → lokið.**

Verktaki getur verið:

**Tilboð → samþykki → Verk → reikningsgrunnur → reikningur.**

---

# 19. Tilboð

Tilboð er sjálfstætt viðskiptaskjal, ekki bara „óstaðfestur reikningur“.

Staðfest útgáfa þarf að varðveitast.

Ef tilboð verður að Verki eða Sölu má ekki yfirskrifa samþykkta útgáfu þess.

Aukaverk eiga að vera rekjanleg viðbót en ekki þögul breyting á samþykktu tilboði.

---

# 20. Aðili – ekki sér viðskiptavinatöflur alls staðar

Við héldum áfram með almenna **Aðili / Party** hugsun.

Aðili getur verið:

* einstaklingur,
* fyrirtæki,
* opinber aðili.

Sami aðili getur haft mörg hlutverk:

* viðskiptavinur,
* birgir,
* verktaki,
* tengiliður o.fl.

Viðskiptavinahlutverk bætir síðan við viðskiptaskilmálum eins og greiðslufresti, verðflokki, afslætti og reikningssendingu.

---

# 21. Reikningsviðskipti og kaupheimild

Í verkstæðisdæminu fundum við mikilvæga aðgreiningu.

Það að fyrirtæki geti verið í reikningsviðskiptum þýðir ekki sjálfkrafa að hver sem segist vinna þar megi skuldbinda fyrirtækið.

Dæmið var:

Einhver kemur og segir:

> „Settu þetta bara á B&M.“

Verkstæðið þekkir hvorki manninn né fyrirtækið nægilega vel.

Afgreiðslumaður gæti þá:

* óskað eftir tölvupósti frá ábyrgum stjórnanda,
* viljað sjá fyrirtækislén,
* hringt sjálfur í fyrirtækið,
* fengið munnlega staðfestingu frá ráðandi aðila.

Gmail er ekki sjálfkrafa höfnun; lítið fyrirtæki getur notað Gmail.

Meginniðurstaðan:

**Reikningsheimild fyrirtækis og kaupheimild einstaklings eru tveir mismunandi hlutir.**

GLÖGGT varðveitir hvernig heimild var sannreynd en afgreiðslumaður/fyrirtæki tekur ákvörðunina.

---

# 22. GLÖGGT tekur ekki rekstrarákvörðunina af fyrirtækinu

Verkstæðisdæmið var notað mikið til að stressprófa arkitektúrinn.

Við ræddum t.d. hvort verkstæði eigi að fá samþykki áður en viðgerð heldur áfram.

Niðurstaðan:

**Það er ákvörðun verkstæðisins.**

Siggi getur haft aðra stefnu en annað verkstæði.

GLÖGGT getur framfylgt valinni stefnu:

* samþykki alltaf,
* samþykki yfir ákveðinni fjárhæð,
* munnlegt samþykki,
* SMS,
* tölvupóstur,
* ekkert samþykki krafist.

En GLÖGGT á ekki að ákveða fyrir Sigga hvernig hann rekur fyrirtækið.

---

# 23. Samskipti við viðskiptavin

Við sáum fyrir okkur að viðskiptaatburður geti kveikt samskipti.

Dæmi:

**Bíll tilbúinn → senda SMS til viðskiptavinar.**

Fyrirtækið getur ákveðið hvort:

* SMS fari sjálfkrafa,
* starfsmaður staðfesti fyrst,
* SMS + tölvupóstur fari,
* annað ferli sé notað.

Þarna varð enn skýrari almenn regla:

> **Rekstraratburður → regla → aðgerð.**

---

# 24. Eitt Verk – margir reikningar

Við prófuðum aðstæður þar sem fleiri en einn greiðandi tengist sama Verki.

Niðurstaðan varð mjög einföld:

> **Einn reikningur hefur einn greiðanda.**

En eitt Verk getur myndað marga reikningsgrunna/reikninga.

Dæmi úr tryggingaviðgerð:

Viðgerð: 600.000 kr.
Sjálfsábyrgð eiganda: 100.000 kr.
Tryggingafélag: 500.000 kr.

Þá verða einfaldlega tveir reikningar sem báðir tengjast sama Verki.

Engin þörf er á „mörgum greiðendum á sama reikningi“.

---

# 25. Athugasemdir og skipulögð gögn á reikningi

Tryggingadæmið leiddi til annarrar góðrar aðgreiningar.

Á reikningi þarf að mega skrifa frjálsan texta, t.d.:

**Tjón nr. 12345678**

En ef GLÖGGT þekkir tjónsnúmerið á það einnig að geta verið skipulagt gagn sem tengist Verki/reikningi.

Reglan:

**Skipulögð gögn þar sem þau hafa tilgang + frjáls texti þar sem fólk þarf sveigjanleika.**

---

# 26. Greiðslukjarni

Við aðgreindum:

> **Sala segir hvað var keypt.
> Greiðsla segir hvernig það var gert upp.
> Krafa segir hvað er enn ógreitt.**

Ein sala getur því haft:

* kort,
* reiðufé,
* millifærslu,
* inneign,
* fjármögnun,
* reikning,
* fleiri en eina greiðslu.

Greiðsluleiðir eiga að vera almennar og þjónustuveitendur tengdir með adapter-lagi.

---

# 27. Kortaposar

Við aðgreindum tengdan og ótengdan posa.

### Tengdur posi

GLÖGGT sendir upphæðina og fær niðurstöðu til baka.

### Ótengdur posi

Starfsmaður slær upphæðina sjálfur inn í posa og staðfestir síðan í GLÖGGT.

Tenging er betri upplifun en má ekki vera eina leiðin.

---

# 28. Kortauppgjör og banki

Við ræddum að kortafærslur greiðast ekki endilega allar út á sama tíma.

Rétta keðjan er:

**Sala → kortagreiðsla → greiðsluþjónusta → uppgjör → bankafærsla → afstemming**

GLÖGGT má ekki gera ráð fyrir að allar kortagreiðslur komi inn næsta dag.

Uppgjörstími getur farið eftir:

* kortategund,
* greiðsluleið,
* samningi,
* þjónustuveitanda,
* helgum,
* gjaldmiðli.

Bankinn fær síðan oft eitt nettóuppgjör fyrir margar sölur frekar en eina bankafærslu fyrir hvern kaffibolla.

---

# 29. Kassalota

Við aðgreindum söludag, kassauppgjör og bankauppgjör.

Möguleg keðja:

**Kassi → opna lotu → færslur → loka → telja → bera saman → staðfesta**

Reiðufé:

**upphafssjóður + staðgreiðslusala − úttektir = vænt staða**

Starfsmaður telur raunverulega stöðu og mismunur varðveitist rekjanlega.

Ekki gera ráð fyrir einu uppgjöri á miðnætti; vaktaskipti geta líka lokað kassalotu.

---

# 30. Rafrænir reikningar

Rafrænn reikningur á að vera sendingarleið, ekki sérstök tegund Sölu.

Keðja:

**Reikningsgrunnur → reikningur → staðfesting → sending → viðtakandi → krafa → greiðsla**

Sami staðfesti reikningur getur farið:

* rafrænt,
* í tölvupósti,
* sem PDF,
* í landssértæka þjónustu.

Landssértæk sendingarkerfi eiga að vera adapterar utan við sölukjarnann.

---

# 31. Vara og þjónusta fóru að renna saman í einum kjarna

Seinni hluti dagsins leiddi okkur að mjög mikilvægri einföldun.

Fyrir notandann eru þetta mismunandi hlutir:

* vara,
* þjónusta,
* vinna,
* efni,
* akstur,
* vélatími.

En undir húddinu eru þau að stórum hluta skyld fyrirbæri:

> **Eining → magn → mælieining → verð/kostnaður → hegðun → rekstraratburður**

Dæmi:

* 2 bremsudiskar,
* 14 m³ mold,
* 35 l olía,
* 127 km akstur,
* 3,5 klst. vinna.

Mismunandi orð fyrir fólk, en sameiginleg hugsun fyrir GLÖGGT.

---

# 32. Mælieiningar

Við tókum sérstaklega fram að magn er ekki alltaf „stk.“

GLÖGGT þarf að geta unnið með m.a.:

* stk.
* kg
* g
* l
* ml
* m
* m²
* m³
* km
* klst.

Umreikningur má vera til þegar hann er raunverulega skilgreindur.

En kerfið má ekki t.d. umbreyta kg í lítra án þess að vita eiginleika efnisins.

---

# 33. Birgðir = hreyfingar

Þetta varð enn sterkari regla í dag.

Birgðastaða á ekki bara að vera tala sem einhver breytir.

Hún verður til úr rekjanlegum hreyfingum.

Dæmi:

**2 bremsudiskar teknir úr lager → birgðahreyfing strax.**

Reikningurinn getur beðið í þrjá daga.

Lagerinn má ekki bíða í þrjá daga með að vita að diskarnir séu farnir.

Ef röng vara er tekin og síðan skilað:

**út → inn → rétt vara út**

Ekki yfirskrifa fyrri atburð eins og hann hafi aldrei gerst.

---

# 34. Reikningsgrunnur getur beðið

Í verkstæðisdæminu kom skýrt fram:

Ef vantar varahlut eða verkið er ekki tilbúið:

> **Reikningsgrunnurinn fer á bið.**

Hann er lifandi vinnugagn meðan verkið stendur yfir.

Nýr tími, efni eða kostnaður getur bæst við.

Þegar verki lýkur er reikningsgrunnurinn yfirfarinn og síðan verður reikningur til.

---

# 35. Efni þurfa ekki alltaf að fara á lager

Jarðverktakadæmið var mikilvægt.

14 m³ af mold sem er sótt hjá birgja og keyrt beint á verk er ekki endilega lager.

Mögulegar leiðir:

**Birgir → Lager → Verk**

eða:

**Birgir → Verk**

eða:

**Birgir → Verkstaður/viðskiptavinur**

Birgðir eru því leið sem vara/efni **getur** farið en ekki skyldustopp.

---

# 36. Innkaup eru sjálfstæður rekstraratburður

Innkaup mega ekki verða bara undirflokkur Birgða.

Ein innkaupalína getur farið í:

* lager,
* Verk,
* rekstrarkostnað,
* eign/tæki,
* þjónustu.

Sami birgjareikningur getur jafnvel innihaldið fleiri en eina slíka leið.

---

# 37. Innkaupapöntun, móttaka og reikningur

Við aðgreindum:

**Pöntun** = hvað við ætluðum að kaupa.
**Fylgiseðill** = hvað birgir segir að hafi verið sent.
**Móttaka** = hvað starfsmaður taldi raunverulega.
**Reikningur** = hvað birgir rukkar.

Lager á að hækka samkvæmt raunverulegri móttöku, ekki bara pöntun eða fylgiseðli.

Hlutamóttaka þarf að vera eðlileg:

100 pantað → 60 koma í dag → 40 síðar.

---

# 38. Þríhliða afstemming innkaupa

Þegar gögnin eru til getur GLÖGGT borið saman:

**Pöntun ↔ móttöku ↔ reikning**

Dæmi:

100 pantað
98 móttekið
100 rukkað

Þá kemur frávik til skoðunar.

Starfsmaður sem tekur á móti vörunni þarf ekki endilega að sjá innkaupsverð eða heildarreikning.

---

# 39. Flutningskostnaður og raunverulegt innkaupsverð

Við ræddum að kaupverð vörunnar er ekki alltaf raunverulegur kostnaður hennar.

Dæmi:

Vörur: 800.000 kr.
Flutningur: 120.000 kr.
Raunkostnaður sendingar: 920.000 kr.

Flutningskostnaður getur verið:

* á sama reikningi,
* á sér reikningi,
* frá öðrum flutningsaðila.

Hann þarf að geta tengst pöntun/sendingu/verki.

Síðar getur reiknivél/Innsýn úthlutað honum eftir:

* verðmæti,
* magni,
* þyngd,
* rúmmáli,
* annarri skilgreindri aðferð.

Frumgögnin eru skráð einu sinni.

---

# 40. Innsýn tók stórt stökk í dag

Við fórum frá því að hugsa um Innsýn sem góða stjórnendaskýrslu yfir í eitthvað miklu áhugaverðara:

**Innsýn á að geta uppgötvað.**

Við viljum sjá:

### Verðsögu

* innkaupsverð,
* söluverð,
* breytingar,
* afslætti,
* framlegð.

### Viðskiptasögu

* hvað viðskiptavinur keypti,
* magn,
* tíðni,
* verð,
* verk,
* framlegð.

### Mánaðarsögu

* magn,
* tekjur,
* kostnað,
* framlegð,
* afföll,
* tap,
* þróun.

Þessar víddir eiga að geta skarast.

---

# 41. Framlegð og tap í mörgum myndum

Við ræddum að tap er ekki bara sala undir kostnaðarverði.

Það getur verið:

* sóun,
* afföll,
* ónýtt vinna,
* of mikill akstur,
* lager sem liggur,
* verðhækkun birgja sem söluverð fylgdi ekki,
* unnin vinna sem ekki var rukkuð,
* afslættir,
* rangt álag,
* aðkeypt þjónusta sem ekki skilaði sér í sölu.

Innsýn getur því með tímanum spurt:

> **Hvar verður verðmætið til og hvar lekur það út?**

---

# 42. Innsýn á helst að koma stjórnandanum á óvart

Þetta varð ein skemmtilegasta niðurstaða dagsins.

Markmiðið er ekki að AI giski á eitthvað óvænt.

Markmiðið er að GLÖGGT finni **raunverulegt mynstur í rekstrargögnum sem stjórnandinn hafði ekki sjálfur tekið eftir.**

Til dæmis:

* sala hækkar en framlegð lækkar,
* stór viðskiptavinur skilar minni framlegð en talið var,
* ákveðin vara hefur orðið verri með hverjum mánuði,
* kostnaður byrjaði að breytast á ákveðnum tímapunkti.

En niðurstaðan verður alltaf að vera rekjanleg.

Reglan sem varð til:

> **Óvænt niðurstaða, en aldrei óútskýranleg niðurstaða.**

GLÖGGT þarf alltaf að geta svarað:

> **Af hverju ertu að segja mér þetta?**

---

# 43. Innsýn á að finna spurninguna

Við fórum skrefi lengra.

Innsýn á ekki aðeins að svara spurningum sem stjórnandinn kann að spyrja.

Hún á stundum að:

> **finna spurninguna sem stjórnandanum datt ekki í hug að spyrja.**

Þetta er mögulegt ef frumgögnin og rekstrarsagan eru rétt varðveitt.

---

# 44. Fyrsta árið og samanburðarsagan

Við tókum sérstaklega fram að raunverulegur samanburður við sama tímabil fyrra árs verður ekki til fyrr en næg saga hefur safnast.

Fyrsta árið er því að hluta **grunnár**.

En Innsýn þarf ekki að vera gagnslaus á meðan.

Hún getur notað:

* mánuð á móti mánuði,
* þróun frá upphafi,
* hlaupandi meðaltöl,
* verðbreytingar,
* framlegðarbreytingar,
* viðskiptamynstur,
* frávik.

GLÖGGT má hins vegar ekki þykjast þekkja árstíðarsveiflu sem það hefur aldrei áður séð.

Eftir ár verður hægt að bera saman sama tímabil milli ára.

Eftir tvö, þrjú og fleiri ár verður sagan sífellt verðmætari.

---

# 45. Varðveita frumgögn – ekki fyrirframákveðnar skýrslur

Þetta varð ein mikilvægasta arkitektúrniðurstaða dagsins:

> **Við eigum ekki að hanna gagnalíkanið aðeins fyrir þær skýrslur sem okkur dettur í hug í dag.**

Við varðveitum:

* frumviðburði,
* magn,
* verð,
* kostnað,
* tíma,
* tengsl,
* breytingar,
* uppruna,
* staðfestingar.

Þá getur framtíðar-Innsýn spurt gögnin spurninga sem við höfum ekki einu sinni hugsað upp enn.

Við eigum því ekki að smíða hundrað fyrirfram ákveðnar Innsýn-skýrslur núna.

---

# 46. Afgreiðsla – fyrsta sjónræna hugmyndin

Í kvöld fórum við að sjá Afgreiðsluna sjónrænt.

Grunnhugsunin:

* stórt snertivænt vörusvæði,
* flokkar,
* leit,
* strikamerki,
* núverandi sala hægra megin,
* mjög áberandi greiðsluaðgerð,
* sjaldgæfar aðgerðir faldar undir einfaldara „Meira“.

Markmiðið:

> **Nýr starfsmaður ætti að geta afgreitt fyrstu venjulegu sölu án kennslu á GLÖGGT.**

Við létum einnig gera fyrsta sjónræna mockupið af kaffihúsaútgáfu Afgreiðslunnar.

---

# 47. Afgreiðsla er ekki sama útlit fyrir alla

Jarðverktaki þarf ekki sama yfirborð og kaffihús.

Sami kjarni getur fengið annað vinnuviðmót.

Kaffihús:

**Vara → Greiða → Næsti**

Jarðverktaki:

**Verk → vinna/vél/akstur/efni → reikningsgrunnur → ganga frá**

Verkstæði:

**Tilbúið Verk → reikningsgrunnur → ganga frá sölu**

Sami kjarni, mismunandi samhengi.

---

# 48. Frjáls/óundirbúin sala

Þú bentir á mikilvægt atriði fyrir verktaka og iðnaðarmenn.

Ekki er hægt að gera ráð fyrir að allt sem þeir rukka sé fyrirfram stofnað á takka eða í vöruskrá.

Því þarf Afgreiðsla að styðja **frjálsa línu / óundirbúna sölu**.

Dæmi:

„Breyting á lögn vegna ófyrirséðra aðstæðna“

Magn: 2,5
Eining: klst.
Verð: 14.900 kr.

eða:

„Grjótfylling á verkstað“

Magn: 17,5
Eining: m³
Verð: 6.200 kr.

Ekki á að þurfa að stofna fasta vöru fyrst.

---

# 49. Þrjár leiðir inn í Afgreiðslu

Við festum niður þrjár mikilvægar leiðir:

### 1. Flýtival

Algeng vara/þjónusta á stórum takka.

### 2. Leit eða strikamerki

Vara er til í vöruskrá en ekki á flýtitakka.

### 3. Frjáls lína

Varan/þjónustan var alls ekki undirbúin fyrirfram.

Þetta er sérstaklega mikilvægt fyrir iðnaðarmenn og verktaka.

---

# 50. Gamla Snerta / Store-suite

Við tókum gamla Store-suite/Snerta inn sem rannsóknarefni.

Markmiðið er **ekki að endurgera Snerta**.

Við viljum skoða:

* hvernig vörur utan flýtihnappa voru fundnar,
* hvernig strikamerki virkuðu,
* hvernig óundirbúin sala var gerð,
* hvernig verð/magn/eining var skráð,
* hvernig sala var sett í bið,
* hvernig hún var sótt aftur,
* hvaða vinnuflæði voru óvenju hraðvirk.

Reglan:

> **Snerta er rannsóknarefni, ekki forskrift.**

Ef gömul lausn var sniðug tökum við hugmyndina.

Ef nútímalegri lausn er betri notum við hana.

---

# 51. Sameiginlegi rekstrarkjarninn varð skýrari en áður

Í lok dags erum við farin að sjá mjög almennt mynstur:

**Rekstrareining → magn → mælieining → kostnaður/verð → hegðun → rekstraratburður → saga**

Síðan tengjast atburðirnir eftir þörfum:

* Verk,
* Sala,
* Innkaup,
* Birgðir,
* Vinnustund,
* Greiðslur,
* Banki,
* Bókhald,
* Innsýn.

Þetta þýðir að við þurfum ekki sérstakan „heim“ fyrir hvert hugsanlegt fyrirbæri.

---

# 52. Mikilvæg varnarregla gegn ofhönnun

Verkstæðisdæmin í kvöld sýndu líka annað.

Við reyndum nokkrum sinnum að finna sértilvik sem þyrfti sérstaka lausn.

En grunnkerfið leysti þau oft þegar.

Til dæmis:

* vara vantar → verkið/reikningsgrunnurinn bíður,
* vara gölluð → sama grunnflæði,
* margir greiðendur → margir reikningar,
* vara tekin úr lager áður en reikningur verður til → birgðahreyfing strax,
* efni fer beint á Verk → engin tilbúin lagerferð.

Þetta gaf okkur mikilvæga reglu:

> **Ekki bæta sérlausn við bara vegna þess að sértilvik getur gerst ef almenni kjarninn leysir það þegar.**

---

# 53. Staðan við lok dags

Við erum nú mjög nálægt því að fara aftur í smíði.

Staðan er:

**Hugmyndavinna:** nánast komin fyrir þennan áfanga.
**Arkitektúr:** mjög langt kominn.
**Sameiginleg lokaforskrift/arkitektúrkort:** næsta skref.
**Gagnalíkan og sameiginlegur kjarni:** fyrsta stóra smíðaskrefið þar á eftir.
**Ný UI, m.a. Afgreiðsla:** byggist síðan ofan á kjarnanum.

Við eigum ekki að byrja á því að smíða fallegan kassaskjá og uppgötva síðar að gagnalíkanið undir honum er of þröngt.

Fyrst festum við heildarmyndina.

---

# 54. Helstu setningar dagsins

Nokkrar reglur/setningar standa sérstaklega upp úr eftir daginn:

> **Fastur kjarni, breytileg hegðun.**

> **Verk er rekstrarsaga. Sala er afleiða hennar.**

> **Notandinn skráir rekstraratburðinn einu sinni. GLÖGGT sér um afleiðingarnar.**

> **GLÖGGT stjórnar kerfinu. Stjórnandi stjórnar fyrirtækinu.**

> **Gögn tilheyra fyrirtækisumhverfinu, ekki einstaklingnum sem hefur aðgang að þeim.**

> **Staðfest fyrirtækjasaga er leiðrétt rekjanlega en ekki látin hverfa.**

> **Birgðir eru hreyfingar, ekki bara staða.**

> **Birgðir eru möguleg leið vörunnar, ekki skyldustopp.**

> **Einn reikningur hefur einn greiðanda; eitt Verk getur haft marga reikninga.**

> **Reikningsviðskipti fyrirtækis og kaupheimild einstaklings eru ekki sami hluturinn.**

> **GLÖGGT framfylgir verkferli fyrirtækisins; það tekur ekki rekstrarákvörðunina fyrir fyrirtækið.**

> **Óvænt niðurstaða, en aldrei óútskýranleg niðurstaða.**

> **Innsýn á ekki aðeins að svara spurningunni — hún á stundum að finna spurninguna.**

> **Ekki hanna gögnin aðeins fyrir skýrslurnar sem við þekkjum í dag.**

> **Ekki bæta sérlausn við ef almenni kjarninn leysir vandamálið þegar.**

> **Snerta er rannsóknarefni, ekki forskrift.**

---

# 55. Mat á deginum

Þetta var fyrst og fremst **arkitektúrdagur**, ekki kóðadagur.

En afraksturinn er stærri en fjöldi commit-a hefði sagt til um.

Við erum farin að skilgreina hvernig GLÖGGT getur orðið eitt samhangandi rekstrarumhverfi í stað þess að stækka með því að bæta stöðugt við nýjum, aðskildum kerfum.

Sérstaklega mikilvægt var að við fundum leið til að gera kjarnann almennan án þess að gera notendaviðmótið almennt og óskiljanlegt.

Undir húddinu getur GLÖGGT talað um magn, mælieiningar, rekstraratburði, hreyfingar og tengsl.

Notandinn sér hins vegar áfram:

**kaffi, bremsudisk, vinnustund, gröfu, mold, akstur, reikning eða verk** — eftir því hvað hann er raunverulega að gera.

Þetta er líklega mikilvægasti undirbúningurinn áður en næsta stóra smíðalota hefst.

## Lokastaða um 22:00

Við eigum ekki að halda áfram að finna upp flækjur bara til þess að vera viss.

Næsta skref er að taka arkitektúrinn sem hefur mótast undanfarna daga og **setja hann saman í eitt heildstætt kort/forskrift**. Þar þarf að sjá sameiginlega kjarnann, atburðaflæðið, tengsl eininganna, sannleikslögin, heimildirnar og hvernig Heim, Stjórnborð og Innsýn lesa sömu rekstrarsöguna með mismunandi hlutverk.

Þegar það stendur er tímabært að fara aftur í kóðann.

Já. Þetta er dagur sem við eigum alls ekki að tapa, því stór hluti vinnunnar var ekki kóðun heldur ákvörðun um hvernig GLÖGGT á að vera byggt til lengri tíma. Hér er vinnuskýrslan frá um 05:30 til 23:09, 17. september 2026.

GLÖGGT – vinnuskýrsla 17. september 2026

Vinnutími: ca. 05:30–23:09
Megináhersla: Arkitektúr GLÖGGT, sameiginlegur rekstrarkjarni, UI-uppbygging, Verk, verkþættir, mönnun, vélar/verkfæri/efni, kostnaðardreifing, stuðningsaðgangur og fjöltyngi.

1. Arkitektúrvinna dagsins

Dagurinn hófst á áframhaldandi vinnu við að tryggja að GLÖGGT yrði ekki safn af ótengdum einingum heldur eitt rekstrarkerfi þar sem sjálfstæðar rekstrarstaðreyndir tengjast saman í rekjanlega heild.

Samanburður við önnur kerfi, m.a. DK, var notaður sem gátlisti til að tryggja að grunngeta gleymdist, en ekki sem fyrirmynd sem GLÖGGT ætti að afrita.

Arkitektúrkort 1–9 voru yfirfarin og lokað. Þau festa meðal annars:

sameiginlegan rekstrarkjarna;
merkingarbær tengsl milli staðreynda;
aðskilnað ólíkra sannleikslaga;
tíma, uppruna og rekjanleika;
heimildir og fyrirtækjamörk;
að Innsýn sé afleitt greiningar- og leiðsagnarlag en ekki annar sannleiksgagnagrunnur;
að sérhæfðar einingar eigi hegðun og vinnuflæði en endurtaki ekki sömu rekstrarstaðreyndir.

Meginreglan stendur áfram:

Fastur kjarni – breytileg hegðun.

Sameiginleg málfræði kjarnans byggist m.a. á aðilum, auðlindum, rekstrarþáttum, magni og mælieiningum, tíma, hreyfingum/staðreyndum, tengslum, kostnaði/verðmæti, uppruna og vissu.

Arkitektúrkortagerðin var því talin lokið sem áfangi. Næsta formlega arkitektúrskref verður síðar að umbreyta henni í Arkitektúrforskrift v1 / domain model, en ekki stökkva beint úr hugmyndunum yfir í Prisma-töflur.

2. UI og vinnuumhverfi GLÖGGT

Við héldum áfram að festa þá hugsun að Home sé sameiginleg forsíða tölvunotenda og að hlutverk og heimildir ráði innihaldinu en ekki að mismunandi notendategundir fái gjörólík kerfi.

Aðalleiðarkerfið flytur notanda milli vinnusvæða en hliðarstikan leiðir innan þess vinnusvæðis sem hann er í:

„GLÖGGT segir mér hvar ég er — hliðarstikan segir mér hvað ég get gert hér.“

Home á að vera stutt stöðuyfirlit, ekki annað stjórnborð fullt af smáatriðum. Þegar eitthvað þarfnast vinnu fer notandinn inn í viðkomandi einingu.

Þetta varð sérstaklega mikilvægt varðandi Verk: ef starfsmaður tilkynnir veikindi og það hefur áhrif á verk dagsins getur Home sagt t.d.:

1 starfsmaður tilkynnti veikindi
1 verk ómannað

En sjálf endurskipulagningin fer fram inni í Verk.

3. Verk – grunnuppbygging

Mikil vinna dagsins fór í Verk og þar urðu nokkrar mjög mikilvægar ákvarðanir.

Verk er heildarmarkmiðið.
Verkþættir segja hvað þarf að framkvæma.
Verkröð segir í hvaða röð/dependencies framkvæmdin fer fram.
Úthlutun segir hver eða hvað framkvæmir hvern þátt.

Verk þarf því ekki að vera ein verkefnalína með einum starfsmanni frá upphafi til enda.

Dæmi:

Verk #185

Grafa upp
Skipta/leggja ræsi
Fylla að
Frágangur

Hver verkþáttur getur haft sitt fólk, teymi, vél, búnað, efni, áætlaðan tíma, verktaka og aðrar kröfur.

Verkröðin getur verið einföld A → B → C, en síðar þarf einnig að mega hafa samsíða hluta, t.d. A → (B + C) → D.

4. Stofnun verks – verkþættir byggðir upp einn af öðrum

Við mótuðum mjög skýra UI-hugmynd fyrir stofnun verks.

Notandi byrjar á fyrsta verkþættinum. Hann opnast í hæfilega stórum vinnuramma sem rúmar þær upplýsingar sem þarf.

Þegar fyrsta þætti er lokið velur notandi:

+ Bæta við verkþætti

Þá minnkar fyrri verkþátturinn niður í smellanlega samantektarlínu fyrir ofan og nýr stór rammi opnast fyrir næsta verkþátt.

Til dæmis:

✓ 1 · Grafa upp — Vél 07 · Pétur · ~2 klst.
✓ 2 · Leggja ræsi — 2 menn · ~1,5 klst.
3 · Fylla að ← opinn rammi

Hægt verður að smella aftur á eldri verkþátt og breyta honum áður en beiðni er send.

Röðin á einnig að geta verið breytanleg.

5. Verk hættir ekki að vera breytanlegt þegar það er sent út

Þetta varð ein mikilvægasta regla dagsins.

„Senda verkbeiðni“ frystir ekki verkið.

Raunveruleg vinna þróast. Þegar byrjað er að grafa getur komið í ljós eitthvað sem enginn gat séð fyrir.

Upphaflega:

A → B → C → D

Raunveruleikinn:

A → B → nýr E → C → D

Þá má bæta E inn í verkið, breyta röð, mönnun eða auðlindum.

En GLÖGGT má ekki endurskrifa söguna.

Við varðveitum:

upphaflega áætlun;
breytingarnar;
hver gerði þær;
hvenær;
raunverulega framkvæmd.

Meginreglan varð:

Áætlun má breytast. Framkvæmd sem þegar hefur átt sér stað má ekki endurskrifast.

Og við gerum ráð fyrir að við sjálfir munum vilja breyta þessu UI eftir að fyrsti kóðinn hefur verið prófaður. Þess vegna þarf kóðauppbyggingin sjálf að þola þróun.

6. Framvindutilkynningar milli verkþátta

Verk getur haft valkvæða stillingu um að halda þeim sem bíða eftir næsta verkþætti upplýstum.

Dæmi:

Uppgröftur lokið. Lagning ræsis hafin.
Áætlað að þinn verkþáttur geti hafist um kl. 14.

eða:

Lagning ræsis er á eftir áætlun.
Þinn verkþáttur færist líklega um 1–2 klst.

eða:

Fyrri verkþætti lokið. Þú getur hafið þinn verkþátt.

Þetta hjálpar næsta starfsmanni að undirbúa sig, sækja vél eða efni, klára annað verk eða nýta lausan tíma.

Ekki á að senda óþarfa tilkynningaflóð. Aðeins þeir sem breytingin varðar eiga að fá viðeigandi upplýsingar.

7. Eftirá-skráning er eðlilegur hluti kerfisins

Við festum mjög mikilvæga raunveruleikareglu:

Vinnan þarf ekki að bíða eftir skráningunni.

Það gefst ekki alltaf tími á vettvangi til að breyta verkbeiðni áður en fólk hleypur í verkefnið.

Þess vegna þarf að mega:

bæta við starfsmönnum eftir á;
bæta við vél/búnaði eftir á;
bæta við efni eftir á;
bæta við nýjum verkþætti;
skrifa viðbótarskýrslu;
leiðrétta raunverulegan tíma.

Viðbótarskýrsla á helst að vera að stórum hluta sjálfvirkt útbúin úr þeim gögnum sem þegar liggja fyrir, frekar en að starfsmaður þurfi að skrifa langa ritgerð.

8. Starfsmaður getur kallað aðra inn í verk

Sá sem er þegar að vinna sinn verkþátt getur valið t.d.:

+ Kalla inn í verk

og valið aðra starfsmenn.

Þetta má gerast:

fyrirfram;
meðan verkið stendur yfir;
eftir að vinnan fór fram.

GLÖGGT útbýr þá grunnskráningu fyrir þann sem bættist við.

Mikilvægt:

Sá sem kallar Jón inn er ekki að staðfesta tímaskýrslu Jóns.

Hann útbýr aðeins tillögu/grunn:

Jón kom inn á Verk #185 um 12:30.

Jón fær sína færslu og staðfestir eða leiðréttir sjálfur:

Ég byrjaði 12:45 og lauk 15:10.

Þannig varðveitum við persónulega tímaskráningu hvers starfsmanns.

9. Tímaskörun við önnur verk

Ef starfsmaður sem bættist við var þegar skráður á öðru verki á sama tíma þarf GLÖGGT að finna það.

Dæmi:

Tímaskörun fannst
Pétur var skráður á Verk #172 þegar vinna við Verk #185 hófst.
Yfirgaf hann fyrra verk kl. 12:30?

Notandi getur þá staðfest tilfærslu eða skoðað tímana.

GLÖGGT má ekki sjálfkrafa endurskrifa tímaskráningu í hljóði.

Raunveruleg skörun getur í sumum tilvikum verið rétt og því þarf einnig að mega staðfesta hana.

10. Teymi

Við ákváðum að teymi verði raunverulegt hugtak í Verk.

Dæmi:

Teymi Jón + Pétur

Teymi getur verið:

fast;
tímabundið;
myndað sérstaklega fyrir ákveðið verk.

Heilu teymi má úthluta á verkþátt með einum smelli.

En undir húddinu halda einstaklingarnir alltaf:

eigin tímaskráningu;
eigin réttindum;
eigin reynslusögu;
eigin rekjanleika.

Teymi ≠ deild.

Ef einn úr teyminu er fjarverandi má GLÖGGT sýna það og hjálpa stjórnanda að finna raunhæfan staðgengil.

11. Vélar, réttindi og reynsla

Vélar eru sérstakar auðlindir á verkþætti.

Ef vél er valin getur GLÖGGT þrengt mönnunartillögur út frá staðreyndum:

formlegum réttindum;
tiltækileika;
núverandi verkum;
reynslu á sömu vél;
reynslu á viðeigandi vélaflokki;
tíma/deadline.

Formleg réttindi og reynsla eru ekki sami hluturinn.

Skráðir vélatímar geta sýnt reynslu en eru ekki sjálfkrafa sönnun fyrir formlegum réttindum eða hæfni.

GLÖGGT á ekki að búa til dularfullt AI-einkunnarkerfi fyrir starfsmenn. Kerfið sýnir staðreyndir og stjórnandi velur.

12. Verknúmer og verklykill

Þetta var skýrt mjög ákveðið:

Verknúmer = einstakt auðkenni ákveðinnar framkvæmdar.

Verklykill = flokkun, uppgjörs- eða rekstrarsamhengi sem getur komið fyrir á mörgum verkum.

Dæmi:

Verk #185 → verklykill 47120
Verk #203 → verklykill 47120

Það er fullkomlega eðlilegt.

Reikningur verktaka á hins vegar helst að vísa í Verk #185, því verklykill einn getur átt við fjölda verka.

Verklykill á heldur ekki sjálfkrafa að segja okkur hvaða vél, hæfni eða starfsmaður eigi við. Hann getur einfaldlega verið staður, kostnaðarstaður eða annað samhengi.

13. Verkfæri og annar búnaður

Við fórum frá vinnuvélum yfir í almenna auðlindahugsun.

GLÖGGT á að geta skráð t.d.:

gröfu;
bíl;
steinsög;
jarðvegsþjöppu;
dælu;
rafstöð;
annan búnað.

Notandinn ræður sjálfur hversu djúp skráningin er.

Eitt fyrirtæki gæti bara skráð:

Steinsög

Annað gæti viljað:

Steinsög 04
gerð
raðnúmer
QR
staðsetning
notkunarsaga
viðhald
skjöl o.s.frv.

Við eigum því ekki að takmarka verkfæri við einfalda textaskráningu, þó fyrsta notkun geti verið mjög einföld.

14. Vinnutími og tækjanotkun eru ekki sami hluturinn

Dæmið sem festi þetta:

Starfsmaður — 2,0 klst. vinna
Steinsög — 1,5 klst. notkun

Þetta eru tvær sjálfstæðar rekstrarstaðreyndir.

Meginreglan:

Vinnutími manns ≠ notkunartími tækis ≠ það sem er rukkað.

Sama á við um stærri vélar.

Starfsmaður getur verið 7 klst. á verki en gröfan gengið 5,2 klst.

Þetta er einnig mikilvægt vegna vélamæla: raunverulegur vélamælir er sérstaklega mikilvægur fyrir viðhald og líftímasögu, en á ekki að endurskrifa þann tíma sem starfsmaður skráði vélina á ákveðið verk.

15. Efni, vörur og mælieiningar

Við tengdum Verk enn skýrar við Birgðir og Sölu.

Dæmi úr umræðunni:

Sandur — 13 m³
Hellur 30×30 — 30 m²

Verkþáttur getur því safnað:

vinnu;
vélum;
verkfærum;
efni;
vörum;
akstri;
verktökum.

Mælieiningar þurfa að vera almennar, t.d.:

stk. · kg · l · m · m² · m³ · km · klst.

„Hellur 30×30“ er varan en „30 m²“ getur verið magnið sem var notað/selt.

Síðar getur kerfið þekkt umbreytingu yfir í fjölda hellna ef fyrirtækið vill slíka dýpt, en það á ekki að neyða starfsmann til óeðlilegrar skráningar.

16. Verk → Birgðir → Sala

Raunveruleg notkun á Verk getur orðið grunnur að reikningsgerð.

Dæmi:

Sandur — 13 m³
Hellur 30×30 — 30 m²
Gröfuvél — 3,2 klst.
Vinna — 9 klst.

En GLÖGGT má ekki gera ráð fyrir að allt sem var notað verði rukkað nákvæmlega þannig.

Við þurfum að geta aðgreint:

kostnað;
notað magn;
birgðahreyfingu;
sölumagn;
sölureglu/verð.

Þannig veit Verk hvað gerðist, Birgðir hvað fór út, Sala hvað á að rukka og Innsýn getur síðar séð framlegðina.

17. Innri kostnaður véla og búnaðar

Mjög mikilvæg viðbót kom upp varðandi sveitarfélagið.

Vél eða búnaður getur haft sinn vélalykil/kostnaðarlykil og innra gjald.

Dæmi:

Gröfuvél 07
Vélalykill 62007
3,2 klst. × 18.000 kr. = 57.600 kr. innri vélakostnaður

Verkið fær þá raunhæfan kostnað þó enginn utanaðkomandi reikningur hafi verið gefinn út.

Þetta getur síðar hjálpað sveitarfélagi eða fyrirtæki að sjá:

hvað eigin vél kostar;
hvað hún vinnur mikið;
hvað hefur verið dreift á verk;
eldsneyti;
viðhald;
viðgerðir;
tryggingar;
afskriftir;
samanburð við leigu eða verktaka.

Auðlindin, notkunin, kostnaðarreglan og bókhalds-/kostnaðarlykillinn eiga að vera tengd en ekki sami hluturinn.

18. Sveitarfélagstilraunin styrkir almenna GLÖGGT-kjarnann

Við vorum sammála um að þó Verk sé nú þróað með mjög raunverulegu sveitarfélagsdæmi í huga eigum við ekki að smíða sveitarfélagskerfi.

Við smíðum almenna virkni og sveitarfélagið notar hana á sinn hátt.

Sveitarfélagsþarfirnar hafa þegar hjálpað okkur að finna almenn hugtök:

verknúmer;
verklykla;
verkþætti;
teymi;
fólk;
vélar;
verkfæri;
magn;
efni;
kostnað;
innri kostnaðardreifingu;
tímaskráningu;
birgðir;
sölu.

Þetta nýtist jafnframt verktökum, verkstæðum, byggingarfyrirtækjum, þjónustufyrirtækjum og mörgum öðrum.

Niðurstaðan okkar var í raun:

Við erum að græða á sérþörfunum vegna þess að þær neyða almenna kjarnann til að verða betri.

19. Stuðnings-/Admin-aðgangur

Seint um kvöldið fórum við í mikilvæga öryggis- og stuðningshönnun.

Upphaflega var rætt að notandi gæti fengið tilviljunarkenndan einnota kóða á skjá, lesið hann upp fyrir GLÖGGT Admin og Admin slegið hann inn til að fá tímabundinn stuðningsaðgang.

Síðan kom mikilvæg varúð:

Ef allir starfsmenn gætu sent mál beint til okkar gæti stuðningsflæðið fljótt orðið yfirfullt og alvarleg vandamál drukknað í smærri málum.

Því var samþykkt eftirfarandi leið:

Allir mega tilkynna vandamál → tilnefndur stjórnandi fyrirtækisins yfirfer → stjórnandi ákveður hvort málið fari til GLÖGGT → GLÖGGT yfirfer → ef aðgangs er þörf óskar GLÖGGT eftir honum → stjórnandi samþykkir tímabundinn aðgang.

Einnota kóðinn tilheyrir því aðgangssamþykkinu, ekki fyrstu kvörtun starfsmanns.

Stuðningsaðgangur á að vera:

tímabundinn;
bundinn við ákveðið fyrirtæki/mál;
samþykktur;
rekjanlegur;
sjálfkrafa lokanlegur/útrunninn.

Það þarf að varðveita:

hver tilkynnti;
hver yfirfór;
hver sendi til GLÖGGT;
hver samþykkti aðgang;
hvaða GLÖGGT Admin tengdist;
hvenær;
hvað var gert;
hvenær lotu lauk.

Engin almenn bakdyr fyrir GLÖGGT Admin.

20. Fjöltyngt GLÖGGT Admin og fjöltyngd Verk

Síðasta stóra umræðuefni kvöldsins var tungumál.

GLÖGGT Admin á að birtast á því tungumáli sem hver Admin-notandi kýs, óháð tungumáli fyrirtækisins sem verið er að aðstoða.

En við fórum lengra.

Verk getur sjálft verið í öðru landi og haft annað vinnumál. Til dæmis getur Verk verið í Póllandi.

Þá getur:

pólskur starfsmaður unnið í Mobile á pólsku;
verkið haft pólsku sem vinnumál;
íslenskur stjórnandi unnið í sínu GLÖGGT á íslensku;
GLÖGGT Admin unnið á íslensku.

Frumtexti skal þó alltaf varðveittur óbreyttur.

Ef pólskur starfsmaður sendir verk-/vandamálalýsingu á pólsku til GLÖGGT Admin skal okkar umhverfi geta sýnt íslenska þýðingu, en frumtextinn verður áfram varðveittur og aðgengilegur.

Sama hugsun getur virkað í hina áttina þegar íslenskur Admin eða stjórnandi svarar pólskum starfsmanni.

Þannig varð fjöltyngi ekki bara þýðing á hnöppum heldur mögulegt fjöltyngt vinnuflæði milli fólks.

Góð lokaformúla dagsins:

Viðmót fylgir notanda. Verk getur haft vinnumál. Frumgögn halda sínu upprunalega tungumáli. Þýðing er hjálparlag en ekki nýtt frumgagn.

21. Heildarniðurstaða dagsins

Þetta var óvenju mikilvægur hönnunardagur þó við værum ekki að dæla út kóða.

Við fórum frá efsta arkitektúrlagi GLÖGGT niður í mjög raunverulegt dæmi þar sem starfsmaður stendur úti í skurði, þarf annan mann, steinsög, 13 m³ af sandi og 30 m² af hellum — og komumst síðan aftur upp í Sölu, Birgðir, kostnaðardreifingu, Innsýn, heimildir, stuðning og fjöltyngi.

Það er einmitt prófið sem arkitektúrinn þurfti að standast.

Verk varð ekki sérkerfi. Það varð ein af birtingarmyndum sameiginlegs rekstrarkjarna GLÖGGT.

Mikilvægustu setningar dagsins sem ég myndi varðveita orðrétt sem hönnunarreglur eru:

Fastur kjarni – breytileg hegðun.

Einfalt fyrir notandann — skipulagt og sundurgreint í grunninum.

Verknúmer er einstök framkvæmd. Verklykill er samhengi/flokkun og má endurtaka sig.

Áætlun má breytast. Framkvæmd sem þegar hefur átt sér stað má ekki endurskrifast.

Vinnan þarf ekki að bíða eftir skráningunni.

Vinnutími manns ≠ notkunartími tækis ≠ það sem er rukkað.

Allir mega tilkynna vandamál; aðeins tilnefndir aðilar senda málið út úr fyrirtækinu til GLÖGGT og samþykkja stuðningsaðgang.

Viðmót fylgir notanda. Verk getur haft vinnumál. Frumgögn varðveita frummálið.

Og stærsta niðurstaðan er líklega þessi:

Við erum ekki að reyna að sjá fyrir nákvæmlega hvernig GLÖGGT verður eftir fimm ár. Við erum að byggja grunn sem gerir okkur kleift að breyta GLÖGGT næstu fimm árin án þess að missa gögnin, merkinguna eða rekjanleikann.

Lok dags: 23:09, 17. september 2026.

Þessa vinnuskýrslu myndi ég telja eina af þeim sem eiga að fara óstytta inn í GLÖGGT vinnudagbókina, því hún varðveitir ekki bara niðurstöðurnar heldur hvernig Verk fór úr sérlausnarhugmynd yfir í almenna rekstrarhönnun GLÖGGT.

Hér er ýtarleg vinnuskýrsla fyrir GLÖGGT frá um kl. 07:00 í morgun, 18. september 2026, og fram að lokum vinnu í kvöld.

GLÖGGT – vinnuskýrsla 18. september 2026

Dagurinn byrjaði á því að við héldum áfram að móta Verk sem raunverulegan rekstrarkjarna, en ákváðum að vinna örugglega í /verk10 samhliða gamla /verk svo við myndum ekki skemma það sem þegar var til. Um kvöldið var þessi tilraunaútgáfa orðin það mikið betri en gamla Verk að við færðum hana formlega yfir og gerðum hana að aðal-Verk kerfisins í production.

Um kl. 07:00–09:00 – grunnur nýja Verk

Fyrsta meginákvörðunin var að /verk10 yrði þróunarsvæði við hlið gamla /verk, ekki yfirskrift á því. Þetta gaf okkur frelsi til að endurhanna Verk án þess að þurfa stöðugt að verja eldri virkni.

Við festum betur þá meginreglu að GLÖGGT eigi ekki að hafa sérstakt kerfi fyrir hverja atvinnugrein. Verk á að byggja á sameiginlegum kjarna þar sem fyrirtæki kveikir á þeirri hegðun sem það þarf.

Þar kom meðal annars fram að:

Vinnuvélar eiga ekki að vera harðkóðaður hluti allra fyrirtækja.
Slík virkni á að vera capability/eining fyrirtækis, t.d. verk:machines.
Ef fyrirtæki notar ekki vélar, á vélarflipi og tengd virkni einfaldlega ekki að sjást.
Sama hugsun getur síðar gilt um ökutæki, verkfæri, báta, herbergi, stöðvar, verktaka, efni, akstur o.fl.

Þetta styrkti arkitektúrinn „fastur kjarni, breytileg hegðun“.

Samhliða þessu var fjöltyngi tekið alvarlega inn í sjálft Verk. Niðurstaðan var að ekki aðeins UI-textar heldur einnig rekstrarlegt efni sem starfsmaður sér eigi að geta birst á hans tungumáli, á meðan frumtextinn er varðveittur óbreyttur.

Við vorum þá þegar að vinna með íslensku, ensku, pólsku og serbnesku.

Um kl. 09:00 – Verkþættir verða raunverulegur gagnakjarni

Stóra breytingin snemma dags var að Verk fékk raunverulega WorkPart einingu í gagnagrunninn.

Áður var Verk meira ein heild. Nú varð hægt að hafa eitt Verk með mörgum verkþáttum.

Bætt var við meðal annars:

WorkPart
WorkPartTranslation
röðun verkþátta
stöðu
upprunatungumál
rekjanleika
tengingu WorkOrder → many WorkPart

Gamla WorkOrder var ekki eyðilagt heldur nýja lagið sett ofan á það.

Prófunardæmin okkar urðu meðal annars:

Tengja fráfall frá þurrkara – lokið.
hreinsa stíflu í affalli þvottavélar – fyrirhugað.

Þarna fór Verk að líkjast miklu meira raunverulegu verkstjórnarkerfi en einföldum verklista.

Um kl. 09:30–10:30 – úthlutun og raunveruleg vinna aðskilin

Næsta mikilvæga arkitektúrákvörðun var að úthlutun starfsmanns á verkþátt má ekki vera það sama og skráð vinna.

Við bættum því við WorkPartAssignment.

Fyrsta útfærslan miðaði við PERSON, en gagnalíkanið var gert víðara svo síðar megi úthluta:

einstaklingi
teymi
vél
ökutæki
verkfæri
verktaka

Þetta var mikilvægt vegna þess að það að Benedikt sé settur á Verk þýðir ekki sjálfkrafa að hann hafi unnið 20 mínútur við það.

Því kom næst sérstakt lag fyrir staðreyndir um unna vinnu:

WorkPartLaborFact

Þar geymum við meðal annars:

starfsmann
verkþátt
dagsetningu
raunverulegan tíma
athugasemd
uppruna
mögulega ógildingu

Í viðmótinu var tíminn settur upp sem klukkustundir + mínútur, en undir húddinu eru mínútur varðveittar sem einföld og áreiðanleg grunneining.

Þarna festum við líka mikilvæga reglu:

Úthlutun ≠ raunveruleg vinna.

Dagsetningar og íslensk framsetning

Strax þarna kom í ljós að native browser-date reitir sýndu bandarískt form á sumum stöðum.

Við byrjuðum því að færa sýnilegar dagsetningar yfir í:

dd.mm.áááá

á meðan gagnagrunnurinn heldur áfram að vinna með stöðluð dagsetningargildi.

Þessi vinna varð síðar um kvöldið aftur sérstakt verkefni á starfsmannaspjaldinu.

Fyrir hádegi – þýðingar verða varanleg gögn

Við héldum áfram með þýðingar þannig að þær væru ekki bara tímabundnar á skjánum.

Verk fékk stuðning við:

upprunatungumál Verks
varanlegar þýðingar á Verki
varanlegar þýðingar á Verkþáttum
þýðingar á vinnuathugasemdum

AI á ekki að þýða sama efnið endalaust. Reglan varð:

varðveita frumtexta
leita að fyrirliggjandi þýðingu
aðeins kalla á AI ef þýðingu vantar
varðveita AI-notkun og niðurstöðu

Þetta passar beint við meginregluna okkar:

Gögn fyrst, AI síðan.

Um hádegi – Afleiðingar / Effects

Við byggðum svo mikilvægt lag sem fékk vinnuheitið Afleiðingar.

Þar var mótuð þessi keðja:

Verkþáttur → Úthlutun → Raunnotkun → Afleiðugrunnur

Markmiðið er að staðreyndir úr Verki geti síðar myndað fjárhagsleg áhrif án þess að GLÖGGT stökkvi beint úr „10 mínútur unnar“ yfir í bókun eða reikning.

Fyrsta útgáfan sýndi meðal annars:

vinnukostnaðargrunn
mögulegan sölugrunn
stöðu eins og „Regla/verð vantar“

Við prófuðum bæði 10 og 15 mínútna raunverulega vinnu og fengum samsvarandi afleiðugrunn.

Mjög mikilvæg regla var fest:

Staðreynd má mynda grunn að afleiðingu, en má ekki sjálfkrafa bóka eða reikningsfæra.

Þannig er áfram skýr aðgreining milli:

þess sem raunverulega gerðist
útreikningsgrunns
verð-/kostnaðarreglu
reiknings
bókhalds
Um hádegi – efnisnotkun á Verk

Næst bættum við við almennu líkani fyrir raunnotkun annarra auðlinda:

WorkPartUsageFact

Fyrsta kind var:

MATERIAL

Þar var hægt að skrá:

heiti efnis
vörunúmer/kóða
dagsetningu
magn
mælieiningu
athugasemd
rekjanlega ógildingu

Afleiðingar fóru þá að geta sýnt:

mögulega birgðahreyfingu
efnis-kostnaðargrunn
mögulegan sölugrunn fyrir efni

Þarna varð líka skýrt að birgðir, kostnaður og sala eru þrjú aðskilin lög, jafnvel þótt sama raunnotkun geti haft áhrif á þau öll.

Síðdegis – Birgðir v1

Við fórum síðan yfir í fyrsta raunverulega Birgðakjarnann.

Birgðir fengu meðal annars:

vöruskrá
lagerstaði
rekjanlegar birgðahreyfingar
upphafsstöðu
handvirkt inn/út
reiknaða stöðu
lágmarksbirgðaviðvaranir
i18n-undirstöðu

Síðan tengdum við Verk beint við birgðir með „Velja úr birgðum“.

Þegar efni er valið úr birgðum getur GLÖGGT fyllt sjálfkrafa inn:

vörukóða
einingu
lagerstað
dagsetningu
magn

Handvirk skráning var samt varðveitt sem fallback.

Við prófuðum m.a. vöruna Tengi.

Við sáum stöðu þar sem Tengi var upphaflega 10 stk. og eftir 5 stk. notkun á Verki voru 5 eftir.

Afleiðingar gátu þá greint á milli:

efnis sem var raunverulega tengt við birgðir og „Fært úr birgðum“
eldri handvirkrar efnisnotkunar þar sem „Birgðatenging vantar“

Þetta var stórt skref því Verk og Birgðir voru nú farin að vinna saman í gegnum staðreyndir í stað lausrar textaskráningar.

Leiðréttingar á opnu og lokuðu Verki

Við ræddum mjög mikilvæga rekjanleikareglu.

Á opnu Verki á venjuleg leiðrétting ekki að verða að óþarflega flóknum sýnilegum leiðréttingarbunka.

Dæmi:

skráð 5 stk.
notandi átti við 4 stk.
breytir einfaldlega í 4

Tæknilega má updatedAt auðvitað breytast, en notandinn þarf ekki að sjá dramatíska leiðréttingarsögu vegna einfaldra innsláttarvilla á opnu Verki.

Þegar Verki hefur verið lokað, breytist reglan:

breyting verður rekjanleg
hver breytti
hvenær
ástæða
tengd birgðaleiðrétting
enduropnun Verks sjálfs þarf einnig að vera rekjanleg

Þetta er mikilvæg aðgreining sem við ætlum að nota víðar í kerfinu.

Þjónusta 9000 og aðskilnaður vöru/þjónustu

Við stofnuðum prófunarfærsluna Þjónusta 9000 og sáum strax arkitektúrgalla:

kerfið meðhöndlaði þjónustuna eins og lager-vöru og birgðastaðan fór niður fyrir núll.

Það leiddi til mikilvægrar hönnunarákvörðunar:

Hvort hlutur er lagerhaldinn er sjálfstæður eiginleiki frá því hvort hægt er að selja eða kaupa hann.

Þannig getur þjónusta verið:

seld
verðlögð
mæld í stk., klst., ferð, verk, m² o.s.frv.

án þess að hún:

eigi lagerstað
hafi birgðastöðu
valdi birgðahreyfingu

Þarna aðskildum við líka enn betur þjónustueiningu á reikningi frá raunverulegum vinnutíma starfsmanns.

Innri kostnaður og reikningsfærsla

Við mótuðum næst hvernig vinnukostnaður á að haga sér.

Raunveruleg vinna á alltaf að vera nákvæm:

t.d. starfsmaður vann 17 mínútur.

Innri kostnaður má þá reiknast á nákvæmum mínútum.

En sala getur fylgt annarri reglu, t.d.:

lágmarksgjald
30 mínútna einingar
60 mínútna einingar
föst verkverð

Þannig má aldrei rugla saman:

raunverulegum innri kostnaði og því sem rukkað er út.

Við ákváðum jafnframt að innra kostnaðarverð starfsmanns eigi heima á starfsmannaspjaldi, helst sem kostnaður á mínútu með sögulegum gildistíma.

Sama hugsun getur síðar átt við um vélar og tæki.

Um kl. 13:00 og áfram – Starfsmannaspjald verður næsti kjarni

Þú sagðir þá að við þyrftum almennilegt starfsmannaspjald með persónuupplýsingum, réttindum og launum.

Við mótuðum kjarnann sem:

Person/User → Employee → Company

og einingar eins og Mobile, Verk, Vinnustund og Laun lesa síðan starfsmannatenginguna.

Mikilvæg niðurstaða var að:

Mobile-aðgangur má ekki ráðast af því hvort fyrirtækið notar Vinnustund.

Starfsmaður getur þurft Mobile vegna Verks þó Vinnustund sé ekki virk.

Starfsmannaspjald v1

Seinna síðdegis/um kvöldið var raunverulegt starfsmannaspjald byggt.

Migration:

20260918190000_add_employee_core

Spjaldið fékk meðal annars:

grunnupplýsingar
ráðningarstöðu
ráðningarform
starfshlutfall
upphaf/lok ráðningar
launasögu
gildistíma launa
innra kostnaðarverð á mínútu
réttindi og hæfni

Launaupplýsingar voru hugsaðar sem takmarkaðar upplýsingar en Verk getur notað innra kostnaðarverð án þess að sýna starfsmanni eða verkstjóra sjálf launin.

Virkur/óvirkur starfsmaður

Við lentum í því að starfsmaður virtist hverfa úr Verk.

Ástæðan var að „virk ráðning“ var ekki merkt.

Þetta sýndi að það var hættulegt að hafa active/inactive sem venjulegt checkbox inni í almennri vistun.

Við breyttum hugsuninni þannig að:

venjuleg breyting á starfsmannaspjaldi eigi ekki óvart að gera starfsmann óvirkan
virkja/óvirkja eigi að vera sérstök, meðvituð aðgerð
Réttindi og skírteini

Við þróuðum réttindahlutann töluvert.

Þú bentir réttilega á að raunveruleg réttindaskírteini innihalda oft marga flokka/kóða.

Því má kerfið ekki vera of stíft.

Réttindi þurfa meðal annars að geta geymt:

réttindategund
frjálsan kóða
útgáfudag
gildistíma
athugasemdir

Kóðar mega t.d. vera:

B, BE, C, CE

eða flokkar vinnuvélaréttinda.

Migration:

20260918195500_add_employee_qualification_codes

Við bættum einnig við því að réttindaspjöld mætti opna aftur og breyta, og sérstakan „Vista réttindi“ hnapp.

Mobile – innskráningarvandi

Um kvöldið prófuðum við nýjan Mobile-notanda.

Fyrst kom villa:

„Virkt fyrirtæki eða innskráning vantar“

og server svaraði 500.

Við fórum yfir company-context og festum aftur arkitektúrinn:

User → Employee/UserCompany → Company → Mobile

ekki:

User → Vinnustund → Company

Við bjuggum til lagfæringu fyrir Mobile company context.

Seinna kom þó í ljós að hluti vandans gæti einfaldlega hafa verið rangt lykilorð í prófuninni, því innskráning virkaði þegar hún var prófuð aftur.

Myndavélarvandamál í Mobile er enn til staðar en var meðvitað sett til hliðar fyrir sérstaka Mobile-lotu seinna.

Git og Vercel – stór hreinsunarlota

Kvöldið varð síðan mjög mikið deployment-verkefni.

Við komumst að því að staðbundna C:\GLÖGGT verkefnið gat byggst þótt ýmsar nauðsynlegar skrár væru ótrackaðar í Git.

Þetta útskýrði hvers vegna Vercel gat bilað þó local build virkaði.

Við bjuggum til hreint worktree:

C:\GLÖGGT-CLEAN

og fundum hvað vantaði í Git, meðal annars skrár fyrir:

Verk10
work capabilities
i18n
inventory
operational text
translation service
material usage

Við stage-uðum aðeins þær skrár sem áttu við — ekki git add ..

Commit:

43576ac Add missing Work10 inventory and i18n dependencies

Næsta hreina build sýndi að TopClock var líka háður breytingu sem var aðeins local.

Það leiddi til:

1a7d23e Add missing TopClock language support

Við bjuggum síðan C:\GLÖGGT-VERIFY úr þessu commit-i og þar tókst hreint production build alveg.

Þetta staðfesti í fyrsta skipti að Git sjálft innihélt nægan kóða til að byggja nýju kerfin.

Windows prebuilt Vercel mistökin

Við reyndum fyrst Vercel --prebuilt út frá Windows.

vercel build þurfti Admin PowerShell vegna symlink-heimilda.

Build tókst að lokum, en deploymentið sjálft varð vandamál.

Windows-byggði prebuilt pakkinn fór upp á Linux runtime og gaf meðal annars:

Prisma external module vandamál
Next ChunkLoadError

Þá var tekin skýr ákvörðun:

Við deployum ekki Windows --prebuilt aftur.

Production var fyrst endurheimt með því að promote-a síðasta góða deploymentið.

Síðan var búið til ferskt source-worktree:

C:\GLÖGGT-DEPLOY

og Vercel fékk source code, þannig að Vercel/Linux byggði sjálft.

Deploymentið varð Ready á um 42 sekúndum.

Þar með var nýja Verk10/Birgðir/Starfsmannagrunnurinn kominn örugglega aftur í production.

Verk10 verður formlega Verk

Seint um kvöldið var niðurstaðan orðin skýr:

Gamla /verk var orðið mjög lítið notað á meðan /verk10 var orðið raunverulega nýja kerfið.

Þú samþykktir því að við færðum það formlega yfir.

Við bjuggum til cutover þar sem:

/verk varð nýja Verk
/verk/[id] varð nýja Verk-detail
/verk/nytt hélt áfram að vera nýskráning
Sidebar Verk vísar á /verk
sérstakur „Verk 10“ prófunarhnappur hvarf
/verk10 vísar áfram sjálfkrafa á /verk
/verk10/[id] vísar á nýja detail-síðuna

Commit:

afed36f Promote Verk10 to main Verk experience

Fyrsta hreina Vercel-build eftir cutover fann enn eina local dependency:

ServiceTimeTracker tók ekki við interfaceLanguage í þeirri útgáfu sem Git hafði.

Sú skrá var sett sérstaklega inn í Git og commit-uð.

Næsta Vercel source deployment tókst:

Ready – 31 sek.

Production:

greitt-workspace-kjwd78t3v-glo-e-ggt.vercel.app

Þú prófaðir síðan www.gloggt.is.

Þegar /verk10 vísaði sjálft yfir á /verk staðfestir þú einfaldlega:

„virkar“

Þar með var Verk-cutover formlega staðfest í production.

Starfsmannadagsetningar – síðasta lota kvöldsins

Við fórum svo aftur á starfsmannaspjaldið.

Vandinn var að native date-reitir sýndu enn bandarískt snið sums staðar.

Við breyttum þeim yfir í sýnilegt:

dd.mm.áááá

með dagatalshnappi.

Þetta gilti meðal annars fyrir:

fæðingardag
ráðning hefst
ráðningu lýkur
gildistíma launa
útgáfu/gildistíma réttinda

Fyrsta commit:

0ac40a1 Use localized employee date inputs

Build fór hreint í gegn og deployment varð Ready.

Við prófuðum síðan Ráðning hefst.

Þar kom fyrst upp ruglingur þar sem Benedikt hafði eldra rangt gildi en Sigríður rétt.

Síðan kom í ljós raunverulegt vandamál:

sýnilegt format og form-submission format þurftu að passa.

Við ákváðum því:

notandi sér 01.11.2010
undir húddinu sendir formið 2010-11-01

Við löguðum LocalDateInput.

Sú útgáfa byggðist en browserinn neitaði enn að vista.

Þá fannst síðasta smávillan:

pattern í input-inu var escap-að rangt í JSX.

Það var breytt í stöðugt pattern:

[0-9]{1,2}[.][0-9]{1,2}[.][0-9]{4}

Þú prófaðir aftur og svaraðir:

„núna er það í lagi“

Lokacommit:

38b7b92 Fix employee date input validation

Það fór í GitHub og Vercel.

Deployment:

Ready – 37 sek.

Production:

greitt-workspace-gesj93sla-glo-e-ggt.vercel.app

Og að lokum prófaðir þú á production og staðfestir:

„það virkar“

Þar með er dagsetningarlotan lokuð.

Tæknilegar viðvaranir sem komu upp en stöðvuðu ekkert

Öll production build í lok kvölds fóru í gegn með:

TypeScript ✅
Prisma generate ✅
56/56 síður ✅
Next.js production build ✅

Sama Turbopack-viðvörunin birtist áfram þrisvar í:

lib/insight/document-analyzer.ts

vegna dynamic filesystem access við:

existsSync
readFile
createReadStream

Þetta er ekki villa núna en getur síðar valdið því að Turbopack trace-i óþarflega stóran hluta verkefnisins og deployment stækki.

Við eigum að taka það sem sérstakt hreinsunarverk síðar.

Prisma bauð einnig upp á major uppfærslu úr 7.9.1 yfir í Prisma 8 RC. Við gerðum ekki slíka major-upgrade í miðri þessari lotu.

Helstu arkitektúrniðurstöður dagsins

Mikilvægasta sem festist í dag er að Verk er nú farið að byggjast á skýru lagaskiptu líkani:

Verk
→ Verkþættir
→ Úthlutun
→ Raunverulegar staðreyndir
→ Afleiðugrunnur
→ síðar verð/kostnaður/sala/bókhald

Raunveruleg vinna, efnisnotkun og síðar vélanotkun eru staðreyndir.

GLÖGGT má reikna út afleiðingar þeirra en á ekki að stökkva sjálfkrafa yfir í bókun eða reikningsgerð.

Birgðir og Verk eru nú tengd saman.

Starfsmenn eru orðnir sjálfstæður kjarnahluti.

Mobile á að byggjast á starfsmanna-/fyrirtækjatengingu, ekki Vinnustund.

Þjónusta er ekki sjálfkrafa lagerhlutur.

Raunvinnutími og reikningsfærður tími eru ekki sami hluturinn.

Innri kostnaður og sölugrunnur eru aðskilin hugtök.

Réttindi starfsfólks eru orðin raunveruleg gögn með gildistíma og frjálsum réttindakóðum.

Og nýja Verk er ekki lengur „Verk10“ tilraun — það er nú orðið aðal-Verk GLÖGGT í production.

Staðan þegar við stoppum í kvöld

Í lok dags er staðan því:

Verk: nýja kerfið komið í production og staðfest.

Verkþættir: persistent og með þýðingum.

Úthlutun: aðskilin frá raunverulegri vinnu.

Vinnutími: persistent staðreyndir í mínútum.

Afleiðingar: reikna grunn en bóka/rukka ekki sjálfkrafa.

Efnisnotkun: tengd Verkþáttum.

Birgðir: v1 virkar og tengist Verk.

Starfsmannaspjald: komið með ráðningu, launagrunn, innri kostnað og réttindi.

Réttindi: kóðar og gildistímar studdir.

Mobile: company-context arkitektúr staðfestur; myndavél síðar.

Dagsetningar starfsmanna: íslenskt format, rétt ISO submission og staðfest production.

Git/Vercel: örugg deployment-aðferð komin í ljós:
hreint commit → fresh worktree → Vercel source build á Linux.

Og við höfum líka lært hvað ekki á að gera:
ekki deploya Windows --prebuilt, og ekki treysta því að local build sanni að allar nauðsynlegar skrár séu komnar í Git.

Næsti stoppunktur

Við ákváðum að taka þetta áfram á morgun.

Næsta skýra verkefni er:

innra kostnaðarverð starfsmanna með sögulegum gildistíma og tengingu inn í Verk/Afleiðingar.

Það á að gera GLÖGGT kleift að reikna réttan raunverulegan vinnukostnað út frá skráðum mínútum, án þess að launaupplýsingar þurfi að birtast inni á Verki.

Þetta var mjög stór þróunardagur: við fórum frá tilraunaútgáfu af nýju Verk yfir í raunverulegan rekstrarkjarna sem er nú kominn í production.

getur notað sem endurræsingar-/handoff-skjal ef við missum samhengi.
GLÖGGT – dagskýrsla 19. september 2026
Dagurinn fór í tvo stóra meginþræði: annars vegar Fylgiskjöl/Birgðir/AI-vinnslu, hins vegar stóra áframhaldandi uppbyggingu á Verk. Undir lok dags var nýjasta Verk-Mobile lotan komin á Production og Vercel sýndi Ready.
Fylgiskjöl, AI og Innsýn
Við fundum að venjuleg bókanleg fylgiskjöl gátu farið í tvö AI-köll: fyrst RECEIPT_ANALYSIS og síðan aftur í sjálfvirka Innsýn. Þetta sást beint á AI-kostnaðarsíðunni með receipt-númerum og tímastimplum.
Við settum inn rekjanleika á AI-köll svo nú sé hægt að sjá:
- fyrirtæki,
- receipt/document,
- vinnslustig,
- action,
- model,
- tokens,
- kostnað,
- status,
- operation key.
Síðan var sjálfvirk Innsýn hert þannig að bókanlegt skjal með bókunarlínum má ekki fara sjálfkrafa aftur í djúpa Innsýn. Handvirkt „Keyra Innsýn“ er áfram leyfilegt.
Þetta var síðan staðfest í Production með tveimur nýjum fylgiskjölum:
- #290 → eitt RECEIPT_ANALYSIS
- #291 → eitt RECEIPT_ANALYSIS
- engin ný sjálfvirk Insight-köll.
Þannig er tvöfalda AI-lestrinum fyrir venjuleg bókanleg skjöl nú haldið niðri.
AI svaraði en eftirvinnslan bilaði
Sjóvá-skjalið #291 sýndi fyrst „AI-lestur mistókst“, en AI-kostnaðarsíðan sýndi að OpenAI-kallið sjálft hafði tekist.
Við staðfestum þannig að villan var ekki AI-kallið heldur eitthvað eftir að svarið kom til baka — parsing/persistence/post-processing.
Við breyttum því þannig að:
- AI-success og post-processing failure eru aðgreind;
- ef AI svarar en niðurstöðuvinnslan bilar verður status ekki ranglega „AI-lestur mistókst“;
- raunveruleg villa fer í AuditEvent og sést í Rekjanleika;
- stóra Prisma transaction fékk maxWait: 10s og timeout: 30s.
Sjóvá var síðan lesið aftur og vinnslan gekk í gegn.
Sjóvá-prófið
Sjóvá-greiðslukvittunin að fjárhæð 85.677 kr. var síðan rétt sundurliðuð.
Bókun:
- bifreiðatryggingar → 4620,
- heimilis-/fasteignatryggingar → 4640,
- greiðsludreifingarkostnaður → 4980,
- banki → 1510.
Debet og kredit stemmdu bæði 85.677 kr.
Staðfest fyrri tryggingamynstur voru endurnýtt.
Eitt smáatriði fannst:
- skírteini 705186, Kaskótrygging JUH30 Kia EV6, 10.700 kr., kom rétt í bókun en virtist vanta í tryggingaspjaldalistann.
Það er enn óleyst.
Mikilvæg hönnunarákvörðun var ítrekuð: þekkt Sjóvá-snið eiga síðar að fara í deterministic parser fyrst, ekki fulla GPT-5.6 lesningu í hvert skipti.
Markmið:
þekkt snið → deterministic extraction → fyrri staðfest tenging → AI aðeins á óvissu.
Fylgiskjalsupphæð
Við fundum að fylgiskjal gat sýnt 0 kr. í haus þó AI hefði fundið rétta upphæð.
Þetta var lagað og Sjóvá #291 sýndi síðan rétt:
85.677 kr.
Birgðir úr fylgiskjali
Fyrsta útgáfan af birgðaflæðinu sýndi ranglega tryggingar og greiðslugjöld sem mögulegar lagervörur.
Við hertum síuna:
- efnisleg vara getur verið lagerhæf;
- tryggingar, þjónusta, vextir, gjöld, skattar o.fl. eiga ekki í Birgðir.
Sjóvá-skjalið sýndi síðan engan Birgðir-kassa, eins og það átti að gera.
Bónus-strimill
Við prófuðum raunverulegan kassastrimil frá Bónus, 4.722 kr.
GLÖGGT las m.a.:
- MCC franskar, 2 stk × 569 kr.
- Lambhaga salat, 525 kr.
- Bónus kjúkling, 1,468 kg × 1.075 kr./kg
- Bónus kjúkling, 1,332 kg × 1.075 kr./kg
- Bónus poka, 49 kr.
Bókun:
- 4910 Veitingakaup → 4.722 kr.
- 1510 Banki → 4.722 kr.
Bókun stemmdi.
Birgðir sýndu rétt magn, kg/stk og einingarverð.
Mikilvæg regla var staðfest fyrir Benedikt-umhverfið:
allar efnislegar heimilisvörur mega fara í lager, því markmiðið er einnig að fylgjast með verðþróun heimilisvara yfir tíma.
Þetta er umhverfisstilling, ekki almenn regla fyrir öll fyrirtæki.
Þjónusta, tryggingar, gjöld o.fl. fara áfram ekki á lager.
Stofna nýja vöru beint úr fylgiskjali
Við bættum við möguleikanum:
„+ Stofna nýja vöru úr þessari línu“
Ef engin vara passar:
- GLÖGGT leitar fyrst deterministic eftir strikamerki, vörunúmeri eða heiti;
- ef vara finnst er hún endurnýtt;
- annars er ný lagerhaldin vara stofnuð úr fylgiskjalalínunni;
- notandi velur lagerstað;
- magn, eining og staðfest innkaupsverð fylgja með;
- vörustofnun og lagerhreyfing eru í sömu transaction;
- rekjanleiki skráir að varan hafi verið stofnuð úr fylgiskjali.
Ný lagersvæði eru áfram stofnuð inni í Birgðir, ekki á fylgiskjalinu.
Lagerverðmæti
Við bættum við Verðmæti vörulagers á Birgðir.
Fyrsta rekstrarreglan er:
lagerstaða × síðasta staðfesta innkaupsverð
Sýnt er:
- heildarverðmæti,
- verðmæti hverrar vöru,
- verðmæti eftir lagerstað,
- viðvörun ef vara hefur lagerstöðu en ekkert innkaupsverð.
Þetta er sérstaklega merkt sem rekstrarlegt lagerverðmæti, ekki formlegt bókhaldslegt birgðamat/FIFO/veginn kostnaður.
Vörumóttaka úr fylgiskjali uppfærir einnig síðasta staðfesta innkaupsverð vörunnar.
VERK
Eftir að Fylgiskjöl/Birgðir voru komin á góðan stað fórum við aftur í Verk og tókum þrjár stórar lotur.
1. Verkflæði, staða og dependencies
Komið á Production:
- status á Verkþáttum:
  - PLANNED
  - READY
  - IN_PROGRESS
  - ON_HOLD
  - BLOCKED
  - COMPLETED
  - CANCELLED
- hægt að breyta stöðu úr UI;
- hægt að raða Verkþáttum upp/niður;
- hægt að setja undanfara/dependency;
- FINISH_TO_START regla;
- Verkþáttur má ekki verða READY/hefjast/lokast ef nauðsynlegur undanfari er ólokinn;
- hringtengingar bannaðar;
- dependency-kandidatar sem mynda hring eru ekki boðnir;
- óleyfilegar stöður vegna dependency eru disabled í UI;
- startedAt og completedAt fylgja status;
- WorkOrder-status er afleiddur úr Verkþáttum;
- lokað Verk opnast aftur ef Verkþáttur er enduropnaður;
- breytingar á röð, status og dependency fara í AuditEvent;
- textar tilbúnir fyrir is/en/pl/sr.
Commit-message:
Add Work workflow status and dependencies
Production varð Ready.
2. Auðlindakjarni – teymi, vélar, farartæki, verkfæri, verktakar
Stór lota kom síðan á Production.
Nýr WorkResource kjarni styður:
- TEAM
- MACHINE
- VEHICLE
- TOOL
- CONTRACTOR
Komið:
- raunverulegar auðlindaeiningar;
- teymi tengjast Employee;
- auðlind úthlutuð á Verkþátt;
- raunnotkun auðlindar skráð sérstaklega frá úthlutun;
- mælastaða/mælissaga;
- QR-auðkenni undirbúið;
- resource-status, t.d. laus / í notkun / viðhald / biluð;
- innra kostnaðarverð;
- sögulegt kostnaðarverð snapshot-að þegar raunnotkun er skráð;
- RESOURCE_COST_BASIS komið í Afleiðingar;
- mögulegur sölugrunnur aðskilinn;
- ekkert reikningsfært sjálfkrafa;
- /verk/tilfong stjórnunarsíða;
- teymi og vélar orðnar raunveruleg gögn í /verk;
- AuditEvent fyrir mikilvægar breytingar;
- is/en/pl/sr textar.
Við lentum í einni TypeScript narrowing-villu:
resource.kind var string en helper vildi union-type.
Það var lagað með local typed resourceKind.
Commit-message:
Add Work resources teams and usage core
Production varð Ready.
3. Mobile Verk – framkvæmd
Síðasta stóra lota dagsins, og nýjasta Production staðan, er Mobile-framkvæmd.
Komið:
- „Mín verk“ byggt á beinni úthlutun og teymisúthlutun;
- leit eftir:
  - heiti,
  - verknúmeri,
  - verklykli,
  - stað,
  - Verkþætti;
- starfsmaður getur:
  - hafið vinnu,
  - stöðvað tímamælingu,
  - sett Verkþátt í bið,
  - lokið Verkþætti;
- ein virk Mobile-tímamæling á starfsmann;
- tími fer í canonical WorkPartLaborFact;
- source=MOBILE;
- dependencies varin server-side;
- ekki hægt að ljúka Verkþætti meðan annar starfsmaður er enn virkur á honum;
- efnisnotkun úr Birgðum skráð úr Mobile;
- lager lækkar í sömu transaction;
- raunnotkun vélar/farartækis/verkfæris/verktaka skráð úr Mobile;
- kostnaðarverð auðlindar snapshot-að;
- hægt að skrá mælastað;
- mælastaða má ekki lækka í venjulegu Mobile-flæði;
- Employee.preferredLanguage hefur forgang;
- þýddur rekstrartexti Verks/Verkþáttar notaður ef þýðing er til;
- nýtt Mobile textalag fyrir is/en/pl/sr;
- Mobile starfsmannaflæði ekki bundið við bókhalds-canWrite; virkur Employee-tengdur notandi getur skráð framkvæmd.
Commit-message:
Add mobile Work execution flow
Nýjasta Vercel deployment er Ready / Production.
Mikilvægar Verk-reglur sem standa
Verk byggist nú á:
Verk → Verkþáttur → Úthlutun → raunveruleg staðreynd → Afleiðing
WorkPartLaborFact er canonical sannleikur um raunvinnu.
Raunvinna ≠ reikningsfærður tími.
Innri kostnaður ≠ sölugrunnur.
Úthlutun auðlindar ≠ raunnotkun auðlindar.
Sögulegt kostnaðarverð verður að varðveitast við atburðinn; verðbreyting síðar má ekki breyta gömlum Verkum.
Efni úr Birgðum fara í raunverulega lagerhreyfingu.
Afleiðingar mega reikna kostnaðar- og sölugrunn en mega ekki sjálfkrafa stofna reikning eða bókun.
Allir nýir Verk/Mobile-textar skulu vera i18n-ready frá byrjun.
Frumtexti fyrirtækis varðveitist óbreyttur; þýðing er sér lag.
Það sem er næst í Verk
Næsti stóri klumpur sem við vorum komin að er:
QR + mælastaða/mynd + viðhaldslyklar
Þar liggur eðlilegt næsta framhald vegna þess að auðlindakjarninn og Mobile-framkvæmdin eru nú til.
Eftir það eru enn stærri verkefni eftir:
- QR á Verki og vélum;
- mynd af mæli með mælaskráningu;
- viðhaldslyklar og viðhaldstímar;
- raðverk / „næsti lausi“;
- drag-and-drop á starfsmönnum/teymum;
- contractor-link/SMS/QR innskráning;
- PDF til verktaka;
- akstur og ferðir;
- dagslokaspurning „Lokið?“;
- tveggja átta skilaboð;
- Kvarta + skjámynd;
- samþykkt/læsing;
- leyfisstýring/pause/retire/assign;
- tenging Afleiðinga yfir í Sölu/Reikninga;
- hreinsa /verk10 tvíverknað;
- loka gömlu WorkLog-skrifleiðinni eða gera hana formlega legacy-only.
Þekkt ókláruð atriði utan Verk
- Sjóvá tryggingaspjald fyrir skírteini 705186 vantar líklega í entity-listann þótt bókunin sé rétt.
- Þekkt Sjóvá-snið fer enn í fulla AI-greiningu; deterministic „known document/template router“ er ekki kominn.
- AI-kostnaðarsaga virðist mögulega ekki sýna allar eldri lífeyrisgreiðslur sem þú manst að hafi áður verið sýnilegar. Við ákváðum að rannsaka gagnagrunninn áður en við breytum framsetningunni.
- Data-first router fyrir þekkt fylgiskjöl er enn næsta stóra AI-kostnaðarverkefni.
Git-varúð eftir endurræsingu
Repoið inniheldur enn mikið af óskyldum modified/deleted/untracked skrám frá eldri vinnu.
Þess vegna:
- ekki nota git add .
- stage-a alltaf aðeins skrár úr viðkomandi pakka;
- keyra git diff --cached --check;
- skoða git status --short;
- síðan commit/push.
Dæmigerð gömul óskyld atriði eru m.a. bankasíður, stjórnborðssíður, VSK, gamlar root-copy skrár, docs/eldri, generated, fleiri i18n skrár o.fl.
Endurræsingarpunktur
Ef samtalið endurræsist má halda áfram frá þessari setningu:
GLÖGGT 19.09.2026: Nýjasta Production er Ready eftir commit „Add mobile Work execution flow“. Verk hefur nú status/dependencies, resource core fyrir teymi/vélar/farartæki/verkfæri/verktaka og Mobile framkvæmd með tíma, efni, resource usage og mælastaða. Næsta stóra Verk-lota er QR + mælismyndir + viðhaldslyklar. Ekki nota git add .; repo inniheldur mikið óskylt óstage-að efni.

Þetta er staðan sem ég myndi nota sem nýjan upphafspunkt eftir endurræsingu.

Já — hér kemur önnur og aðeins ítarlegri lokaskýrsla fyrir nóttina.
GLÖGGT – vinnuskýrsla 19.–20. september 2026
Kvöldið varð mjög afkastamikið og færði Verk/Mobile töluvert nær raunverulegri notkun. Við byrjuðum á því að festa fyrri Verk-lotuna í Git og production, en fórum síðan beint áfram í Tækjalista, QR-merki, viðhald, Mobile og sameiginlegt stjórnendasvæði.
Stóri tæknilegi checkpointinn fyrr um kvöldið var migrationin 20260919224500_add_work_resource_maintenance. Hún fór rétt inn með prisma migrate deploy, og npx tsc --noEmit fór í gegn með 0 villum. Sú lota var síðan commit-uð sem:
34b01fd – Add work resource QR and maintenance workflow
og push-uð á main. Vercel staðfesti hana síðan sem Ready / Production.
Í production prófuðum við Verk-síðuna og staðfestum að Verk sjálft hleðst eðlilega eftir breytingarnar. Þar sáum við jafnframt að gamla heitið „Auðlindir Verks“ var of kerfislegt og óskýrt. Við ákváðum að notandinn eigi að sjá Tækjalisti, þó undirliggjandi gagnalíkan megi áfram vera almennt.
Tækjalistinn var síðan endurunninn þannig að notandinn sér nú vinnuvélar, ökutæki, tæki og verkfæri, en ekki teymi eða verktaka. Við festum líka að teymi eiga heima undir fólki/skipulagi en ekki í Tækjalista.
Við fórum yfir verðreiti og tókum skýra ákvörðun um að bæði innra kostnaðarverð / einingu og söluverð án VSK / einingu séu valfrjáls. Sama regla á að gilda síðar fyrir mannalaun/vinnukostnað. Fyrirtæki eiga að geta skráð aðeins tíma/magn ef þau vilja og bæta verði við síðar ef þau þurfa kostnaðar- eða framlegðargreiningu.
Við staðfestum einnig að Sérsniðin eining sé aðeins aukamöguleiki og eigi ekki að trufla venjulegt flæði. Hún birtist aðeins ef fyrirtæki þarf einingu sem fellur ekki undir klst., km, stk. o.s.frv.
Fyrir vinnuvélar og ökutæki ákváðum við að skráningarnúmer sé eðlilegur sýnilegur tækjakóði þar sem það á við. Fyrir tæki án skráningarnúmers er notað innra tækjanúmer. Réttindakröfur verða hins vegar sérstök rekjanleg gögn á tækinu, svo GLÖGGT geti síðar tengt starfsmann → réttindi → tæki → má nota / má ekki nota.
Við stofnuðum raunprófunartæki, Sláttutraktor JL-564, og staðfestum að Tækjalistinn sýnir það rétt. Innra kostnaðarverð 8.000 kr. varðveittist og söluverð gat verið autt.
Þar kom upp tvíteknivörn sem fyrst birtist sem Runtime Error. Við fundum að varnarreglan sjálf var rétt — JL-564 var þegar til — en framsetningin var röng. Hún var því breytt þannig að notandinn fær nú eðlilega gula viðvörun: „Tæki með þessu skráningarnúmeri / tækjanúmeri er þegar til.“ Þá var einnig lagað ZIP-pakkningarvandamál sem olli því að tímabundin möppur lentu inni í C:\GLÖGGT og tsc reyndi að þýða þær.
QR-flæðið tók síðan stórt skref. QR-merkið er nú tengt tækinu og sýnir GLÖGGT TÆKI í stað „GLÖGGT AUÐLIND“. QR-stærðin er stillanleg í sentimetrum og við prófuðum raunverulega 2 × 2 cm QR-kóða í prentsýn. Það virkaði. Við bættum einnig við möguleika á mismunandi stærð merkis svo QR-kóðinn geti verið lítill án þess að allt merkið þurfi að vera stórt. Langi innri auðkennisstrengurinn var tekinn af merkinu til að halda því hreinu.
Við fórum einnig yfir viðhald. Orðalagið „Viðvörun fyrir gjalddaga“ var óeðlilegt í þessu samhengi og var breytt í merkingu á borð við „Viðvörun áður en viðhald er tímabært“. Hugmyndin er að kerfið geti t.d. varað við þegar 25 klst. eru eftir þar til þjónusta á 250 klst. verður tímabær.
Í Mobile fundum við að starfsmaður ætti ekki að sjá kerfislegt orðalag eins og „Auðlind“. Þar á að standa Tæki. Við ákváðum líka að myndataka af mæli eigi að vera vinnuaðgerð, ekki skráaraðgerð: „Taka mynd af mæli“ í stað „Veldu skrá“. Native file input má vera undir húddinu, en starfsmaðurinn á að sjá myndavélaraðgerð.
Þá kom stærri hönnunarákvörðun um Mobile: appið á að vera eins einfalt og mögulegt er. Það á ekki að sýna sama viðmót öllum eða verða smækkuð desktop útgáfa. Stjórnandi á að geta valið hvað starfsmaður sér.
Úr því varð nýtt sameiginlegt Stjórnun-svæði fyrir fyrirtækið. Það er aðskilið frá GLÖGGT Admin /stjornbord. Stjórnun á að vera sameiginlegt stjórnunarlag fyrir Bókhald, Verk, Vinnustundir, Sala, Birgðir og fleiri framtíðarþjónustur.
Við festum einnig áskriftarregluna: stjórnandi sér aðeins þá möguleika sem áskrift fyrirtækisins veitir. Undirliggjandi hugsun er nú:
áskrift → virkar einingar → heimildir → Mobile-sýnileiki
Þessi lög eiga að vera aðskilin. Að fela eitthvað í Mobile breytir ekki sjálfkrafa heimildum og fyrirtæki getur ekki virkjað þjónustu sem áskriftin inniheldur ekki.
Fyrsta Stjórnunarsíðan kom upp með þjónustukortum fyrir Bókhald, Sala, Laun, Birgðir, Vinnustundir og Verk, auk Notenda og heimilda, Tækjalista, Fyrirtækisreglna og GLÖGGT Mobile.
Við sáum strax að Mobile-stillingarnar voru fyrst aðeins fyrirtækislegar. Þú bentir rétt á að stjórnandi þarf að geta stillt hvern notanda fyrir sig. Við bættum því við notendasértæku Mobile-sýnileikalagi og nýju Prisma-módeli. Migration:
20260920005500_add_user_mobile_feature_visibility
var keyrð, Prisma validate/generate fór í gegn og npx tsc --noEmit fór áfram í gegn með 0 villum.
Þá kom upp React/UI-villa þar sem hakaðar stillingar virtust fylgja með þegar skipt var milli Benedikts og Sigríðar. Það var lagað þannig að Mobile-formið endurhleðst rétt fyrir valinn notanda. Eftir lagfæringuna staðfestum við á skjá að Sigríður var valin, að hennar stillingar birtust sérstaklega og að „Stillingar vistaðar.“ kom upp. Verk og Vörutalning voru virk hjá henni en Myndataka fylgiskjala óvirk. Þetta leit loksins út eins og rétt notendasértækt flæði.
Stóra kvöldlotan var síðan commit-uð sem:
3399795 – Add company management and user-specific Mobile visibility
og push-uð:
34b01fd..3399795 main -> main
Vercel staðfesti síðan commit 3399795 sem Ready / Production.
Í allra síðasta prófinu kvittaðir þú Verk út í símanum. Það er mikilvæg staðfesting á því að nýja Mobile/Verk-flæðið er komið nógu langt til raunnotkunar.
Nákvæmur stoppunktur fyrir morgundaginn: við byrjum á gömlu Verkunum. Gömul/lokin verk eiga ekki að sitja áfram í sama virka vinnuflæðinu og ný Verk. Við þurfum því að skilgreina og útfæra hvernig þau flytjast sjálfkrafa eða með skýrri stöðubreytingu yfir í annan stað, líklega lokið/saga/skjalasafn, þannig að virka Verk-sýnin haldist hrein. Síðan höldum við áfram að styrkja tengslin milli Tækjalista, Verka og Mobile.
Við endum því nóttina með tvo örugga production-checkpointa, hreint TypeScript, migrationir applied, nýtt Tækjalista/QR/viðhaldsflæði, sameiginlegt Stjórnunarsvæði og notendasértækt Mobile sem er komið í virk próf.
Góða nótt Benedikt. Við byrjum á gömlu/loknu Verkunum á morgun.

verk skýrslu
Já — hér er almennileg verkskýrsla fyrir GLÖGGT, sunnudaginn 20. september 2026. Ég tek með bæði það sem var klárað, það sem var sannreynt í prófun og það sem við fundum að þarf að halda áfram með á morgun.

GLÖGGT – Verkskýrsla 20. september 2026
Yfirlit dagsins
Dagurinn fór að mestu í að færa Verk frá því að vera hefðbundinn verkefnalisti yfir í raunverulegt skipulags-, mannafla- og framkvæmdarkerfi.

Stærsti áfanginn var að við fórum frá litlum handvirkum prófum yfir í raunhæft álagsumhverfi með 50 starfsmönnum, 300 Verkum og 18 vélum/tækjum. Það gerði okkur kleift að hætta að giska á hvernig kerfið ætti að virka og byrja í staðinn að sjá raunveruleg vandamál í notkun.

Við staðfestum sérstaklega að Dagskipulagið getur nú unnið með stóran starfsmannahóp, lifandi tímalínu, leit, síur og stöðu á ákveðnum tíma. Í lok dags kom jafnframt í ljós mikilvæg regla fyrir sjálfvirkar mönnunartillögur: laus starfsmaður má aldrei fá forgang fram yfir starfsmann sem hefur rétta hæfni.

1. Verk – lífsferill og lokun
Við prófuðum og staðfestum lífsferil Verks.

Verkþáttur gat farið í Lokið, talningar uppfærðust rétt og þegar allir Verkþættir voru lokaðir varð Verkið „Tilbúið til lokunar“ í stað þess að lokast sjálfkrafa.

Stjórnandi gat síðan sérstaklega valið „Ljúka Verki“.

Við staðfestum með prófverkinu „Þrif á baðherbergi“ að:

Verkþátturinn hélst lokaður.
Verkið fór úr virku Dagskipulagi.
Það birtist undir Lokið Verk.
Virk verkatalning fór niður.
Fyrri vinnustundir og önnur saga varðveittust.
Þessi aðgreining er mikilvæg:

Verkþáttur lokið → Verk tilbúið til lokunar → stjórnandi lokar Verki.

2. Úthlutun starfsmanna með drag-and-drop
Drag-and-drop úthlutun var byggð inn í Dagskipulagið.

Starfsmann má nú draga úr Fólk-listanum yfir á Verk eða Verkþátt.

Mikilvæg hönnunarregla var staðfest:

Úthlutun er ekki tímaskráning.

Þegar starfsmaður er dreginn á Verk:

hann er aðeins úthlutaður;
raunvinnutími byrjar ekki;
tímaskráning hefst aðeins þegar starfsmaður velur sérstaklega að hefja vinnu eða raunvinna er skráð.
Við fundum einnig að það var mjög slæmt UX að hoppa sjálfkrafa inn á Verksíðu eftir drop.

Það var lagað þannig að stjórnandinn helst á Dagskipulaginu og getur haldið áfram að manna næsta Verk.

3. Vinnustundir starfsmanna
Við mótuðum leiðina fyrir vinnustundir eftir starfsmanni.

Starfsmaður á að vera smellanlegur og þaðan eiga að fást raunverulegar vinnustundir eftir:

degi;
viku;
mánuði;
öllu tímabili;
Verki;
Verkþætti;
dagsetningu;
skráningarmáta.
Mikilvæg regla:

Lokið Verk hverfur úr daglegri framkvæmdarsýn en vinnustundir þess hverfa ekki úr sögu eða skýrslum.

4. Mönnun og áætlaður vinnutími
Við bættum við skipulagsupplýsingum á Verk.

Við stofnun Verks er nú hægt að skrá:

fjölda starfsmanna sem þarf;
áætlaðan vinnutíma;
myndakröfu;
áætlaðan dag;
áætlað upphaf.
Við prófuðum m.a. Verk sem þurfti tvo starfsmenn og kerfið sýndi mönnun rétt.

Þetta gefur grunn að framsetningu eins og:

1 af 2 úthlutað

eða

3 af 3 úthlutað.

5. Kort og staðsetning
Við bættum við „Opna leið að staðsetningu“.

Starfsmaður eða stjórnandi getur því farið beint úr Verki yfir í kortaleið að vinnustað.

Þetta er ætlað að virka bæði á desktop og Mobile.

6. Myndakrafa á Verk
Við ákváðum að myndakrafa verði valkvæð undantekning, ekki sjálfgefin regla.

Sjálfgefið er:

Myndakrafa: Engin

Stjórnandi getur síðan valið myndakröfu þar sem hún á við, t.d.:

fyrir upphaf;
á meðan á framvindu stendur;
fyrir lok Verkþáttar;
fyrir lok alls Verks.
Kerfið getur hindrað lokun ef nauðsynleg mynd vantar.

Þetta hentar sérstaklega viðhaldi, tjónum, mælastöðum, frágangi og öðrum Verkum þar sem sönnun eða stöðuskráning skiptir máli.

7. Prisma – ný skipulags- og myndagögn
Ný migration var sett inn fyrir mönnun og myndagögn.

Migration:

20260920170000_add_work_planning_and_evidence

Við lentum fyrst í Prisma relation-villu þar sem createdWorkEvidencePhotos hafði verið sett á Company í stað User.

Það var lagað.

Eftir lagfæringuna fengum við:

prisma validate → hreint
prisma generate → hreint
npx tsc --noEmit → hreint

Migrationin fór rétt inn í Supabase.

8. Tímasetning Verka
Stórt skref var að greina á milli:

hversu lengi Verkið tekur

og

hvenær Verkið á að fara fram.

Við bættum því við:

áætluðum degi;
áætluðum upphafstíma;
áætlaðri lengd.
Verk með dag en engan tíma birtast nú sem:

Ótímasett í dag

í stað þess að GLÖGGT finni þeim tilbúinn stað á tímalínunni.

Tímasett Verk birtast á sínum rétta tíma.

9. 24 tíma tímakerfi
Við fundum að native browser-time input sýndi AM/PM eftir Windows/vafrastillingum.

Það samræmist ekki GLÖGGT.

Við skiptum yfir í eigið 24 tíma tímaval.

GLÖGGT notar nú:

00–23 fyrir klukkustundir;
00–59 fyrir mínútur.
Einnig er leyfilegt að skrá tíma sem þegar er liðinn sama dag.

Það er mikilvægt því skipulag má vera skráð eða leiðrétt eftir á.

10. Dagsetning og músavæn tímaval
Native dagsetningarreitur sýndi bandarískt dagsetningarform hjá vafranum.

Við færðum framsetninguna nær GLÖGGT-reglunni um:

dd.mm.áááá

og bættum við músavænna tímavali.

Markmiðið var að notandi gæti bæði:

skrifað tíma;
og valið hann með mús.
Við gerðum einnig skipulagsreitina hægra megin á Dagskipulaginu smellanlega svo hægt væri að vinna meira úr Verkinu án þess að yfirgefa skipulagssýnina.

11. Lifandi tímalína
Upphaflega var Dagskipulagið fast í 07:00–17:00.

Það var of takmarkandi.

Við breyttum tímalínunni í lifandi tímasýn.

Í dagssýn:

fylgir glugginn núverandi tíma;
rauð lína sýnir Nú;
hægt er að færa sýnina aftur og fram;
„Núna“ færir hana aftur að rauntímanum.
Við prófuðum m.a. kvöldsýn með kl. 14–23 og rauðri núlínu.

Þetta virkaði rétt.

12. Álagspróf – 50 starfsmenn og 300 Verk
Við bjuggum til sérstakt load-test fyrir:

Próf ehf 2.

Prófunarumhverfið fékk:

50 prófunarstarfsmenn;
300 Verk;
mismunandi starfsheiti;
mismunandi staðsetningar;
mismunandi forgang;
mismunandi mannaþörf;
mismunandi áætlaðan tíma.
Verkin voru fyrst skilin eftir ótímasett til að við gætum prófað skipulagskerfið.

Við bjuggum jafnframt cleanup-skript svo hægt sé að hreinsa prófunargögnin aftur síðar.

13. Skalanlegt Dagskipulag
50 starfsmanna prófið sýndi að venjulegur síðuskrollur var ekki nógu góður.

Við breyttum Dagskipulaginu í sjálfstætt vinnusvæði.

Núna:

Fólk-listinn hefur eigið skroll;
tímalínan hefur samsvarandi skroll;
röðin helst samstillt;
tímahausinn helst aðgengilegur;
aðeins sýnilegar starfsmannaraðir eru renderaðar með windowed/virtual nálgun.
Við prófuðum mikið skroll niður listann og staðfestum að nöfn og tímalínuraðir héldust saman.

Þetta er mikilvægur skalanleikaáfangi.

14. Leit og síur
Nýjar síur voru settar á Dagskipulag:

Allir / Laus / Úthlutað / Í vinnu

Leitin var útvíkkuð þannig að hægt sé að leita að:

starfsmanni;
starfsheiti;
Verki;
staðsetningu;
Verknúmeri;
Verklykli.
Markmiðið er að stór vinnustaður þurfi ekki að fletta í gegnum hundruð starfsmanna eða Verka.

15. „Staða á ákveðnum tíma“
Ný aðgerð var smíðuð:

Staða á ákveðnum tíma

Notandi getur t.d. skrifað:

14:00

og séð stöðu starfsmanna á þeim tíma.

Við skilgreindum mikilvæga aðgreiningu:

Raunvinna – hvað tímaskráning segir að maðurinn hafi raunverulega verið að gera.
Áætlað – hvað skipulag sagði að hann ætti að vera að gera.
Laus – ekkert tímasett eða skráð á þeim tíma.
Þetta opnar seinna spurningar eins og:

„Hvað var Jón að gera kl. 14?“
„Hverjir voru lausir kl. 10?“
„Hver var á þessu Verki í gær?“
„Hvaða Verk voru undirmönnuð kl. 08?“

16. Vélar og tæki – álagspróf
Við bættum við vélaprófunargögnum hjá Próf ehf 2.

Stofnuð voru 18 tæki/vélar/ökutæki.

Þar á meðal voru dæmi eins og:

Bobcat;
Bomag vals;
lyftari;
gröfur;
dráttarvél;
þjónustubílar;
rafstöð;
dæla;
háþrýstiþvottavél.
Við gáfum sumum þeirra:

innra kostnaðarverð;
söluverð;
mælieiningu;
stöðu;
Verk-tengingar.
Ein vél var sérstaklega sett í viðhald og önnur í notkun til að prófa árekstra.

17. Vélamenn og hæfni
Hluti af 50 starfsmönnunum var tengdur vélatengdri hæfni/réttindum.

Markmiðið var að geta prófað:

hver kann á hvaða vél;
hvort vél er laus;
hvort maður er laus;
hvort rétt hæfni fylgir Verki;
hvort kerfið varar við tvíbókun.
Þetta próf varð mjög mikilvægt síðar um kvöldið.

18. Mikilvæg niðurstaða um tækjastöðu
Við sáum dæmi þar sem vél var merkt:

Laus

en hafði samt virkar úthlutanir.

Þar mótuðum við skýrari reglu:

Að vél sé tengd Verki þýðir ekki sjálfkrafa að hún sé Í notkun.

Staða „Í notkun“ á að ráðast af raunnotkun eða tímasettu Verki sem er í gangi.

Framtíðarsýn þarf að greina á milli:

laus;
frátekin/tengd framtíðarVerki;
í notkun;
í viðhaldi;
óvirk.
19. Verkalisti og mönnun
Við fórum að færa Verkalista frá einföldum lista yfir í raunverulegan mönnunarlista.

Við ákváðum:

Ómönnuð og undirmönnuð Verk eiga að fá forgang fram yfir fullmönnuð Verk.

Innan þess ræður svo:

forgangur Verks;
upphafstími;
mannaþörf;
hæfni;
vél/tæki;
árekstrar;
síðar staðsetning og ferðatími.
20. „Manna Verk“
Við byggðum sérstakt mönnunarspjald.

Notandi getur valið Manna Verk án þess að fara í mörg undirskref.

Spjaldið sýnir:

hversu marga vantar;
hæfnikröfur;
búnað;
líklegustu starfsmenn;
tillögu að teymi.
Kerfið úthlutar ekki sjálft.

Stjórnandi samþykkir alltaf.

21. Morgunmönnun
Við mótuðum hugmyndina að sérstakri morgunmönnun fyrir stærri vinnustaði.

Dæmi:

„Allir eiga að vera í vinnu kl. 08:00.“

GLÖGGT á þá að geta sýnt:

hversu margir starfsmenn eru tiltækir;
hverjir hafa ekkert Verk;
hvaða Verk vantar fólk;
hvaða Verk eru hæst í forgangi;
tillögu að heildarmönnun.
Stjórnandi getur síðan samþykkt eða breytt tillögunni.

Þetta er sérstaklega mikilvægt ef einn verkstjóri þarf að koma 30–100 starfsmönnum af stað á stuttum tíma.

22. Lærð pörun starfsmanna
Við ákváðum að GLÖGGT eigi að læra með tímanum hverjir vinna oft saman.

En samkvæmt meginreglunni:

Gögn fyrst, AI síðan

á þetta fyrst að byggjast á samþykktum sögulegum úthlutunum.

Dæmi:

tveir starfsmenn vinna oft saman;
sami vélamaður notar oft ákveðna vél;
ákveðið teymi er oft notað í ákveðinni verktegund.
Slík saga getur síðan fengið vægi í framtíðartillögum.

23. Forgangur í sjálfvirku Verkavali
Við festum einnig mikilvæga reglu:

Forgangur Verks ræður hvaða Verk kerfið reynir fyrst að manna.

Grunnröðin verður:

Brýnt → Hátt → Venjulegt → Lágt

en síðan tekur kerfið einnig tillit til:

tímans;
mannaþarfar;
hæfni;
tækja;
árekstra;
tengsla milli Verka;
sögulegrar pörunar.
Mikilvægasta niðurstaða dagsins
Síðasta prófið í kvöld fann mjög mikilvægan galla í tillögukerfinu.

Við opnuðum Verkið:

„Yfirfara vél 077“

Kerfið vissi ekki hvaða vél Verkið varðaði og hæfni var óstaðfest.

Samt setti GLÖGGT efst sem tillögu:

Þjónustufulltrúa

eingöngu vegna þess að viðkomandi var laus.

Þetta er ekki ásættanleg mönnunarregla.

Við festum því niðurstöðu dagsins:

„Laus“ má aldrei vega þyngra en „hæfur“.

Ef Verkið er vélatengt en vantar tengingu við vél eða hæfnikröfu á GLÖGGT frekar að segja:

„Vantar vél/tæki eða hæfnikröfu til að gefa örugga mönnunartillögu.“

Það má ekki láta fyrsta lausa mann líta út eins og besta valið.

Þetta verður fyrsta verkefni morgundagsins.

Tæknileg staða í lok dags
Prisma migrationar dagsins hafa farið inn.

Við fengum nokkra hotfix-hringi vegna:

Prisma relation;
generated Prisma Client;
WorkOrder/WorkPart týpa;
tímasetningar;
ZIP sem fór óvart í auka undirmöppu;
i18n type-lykla.
Allt var lagað jafnóðum og við fengum aftur hreint:

npx tsc --noEmit

á þeim áföngum sem voru prófaðir.

Production var fyrr í dag einnig uppfært með hluta Verk/Mobile/QR/notification vinnunnar, en seinni stóra Dagskipulags- og mönnunarvinnan er enn í localhost prófun og á ekki að pushast fyrr en við höfum klárað næstu mönnunarreglur og prófað þær betur.

Staða í lok dags
Í lok dags höfum við nú raunhæft prófunarumhverfi hjá Próf ehf 2. með:

50 starfsmönnum;
300 Verkum;
18 vélum/tækjum;
mismunandi forgangi;
mismunandi mannaþörf;
vélahæfni;
lifandi Dagskipulagi;
virtual skrolli;
leit og síum;
tímasetningu;
stöðu á ákveðnum tíma;
drag-and-drop;
mönnunarspjaldi;
teymistillögum;
grunn að morgunmönnun.
Kerfið er því komið langt frá einföldum Verklista og farið að verða raunverulegt daglegt stjórntæki fyrir verkstjóra.

Fyrsta verkefni á morgun
Við höldum áfram nákvæmlega þar sem við stoppuðum:

Laga röðun mönnunartillagna þannig að hæfni og nauðsynleg vél/tæki komi á undan einföldu „laus“-merki.

Síðan prófum við aftur sömu tegund af vélaverki og sjáum hvort:

rétt vél er þekkt;
rétt hæfni er þekkt;
hæfir menn koma efst;
óhæfir/óstaðfestir fara neðar;
vél í viðhaldi eða notkun útilokar eða varar;
forgangur Verks heldur áfram að stýra því hvaða Verk er mannað fyrst.
Þar myndi ég stoppa í kvöld. Við eigum mjög góðan, raunverulegan áfanga að halda áfram frá á morgun.

