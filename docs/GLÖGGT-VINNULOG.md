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