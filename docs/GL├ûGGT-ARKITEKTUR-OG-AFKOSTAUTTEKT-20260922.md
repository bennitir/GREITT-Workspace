# GLÖGGT – arkitektúr- og afkastaúttekt

**Dagsetning:** 22. september 2026  
**Grunnur:** ferskar möppur `app`, `components`, `lib`, `prisma`, `docs` afhentar um 20:24.  
**Markmið:** taka upp aftur samþykkta heildararkitektúrstefnu, endurmeta Verk eftir raunprófanir síðustu daga og finna kerfislæga staði sem gera GLÖGGT þungt eða óþarflega hægt.

---

## 1. Fyrri samþykkt stefna stendur

Úttektin staðfestir eldri arkitektúrákvörðun úr vinnudagbók:

> Aðalleiðarkerfið flytur notanda milli vinnusvæða en hliðarstikan leiðir innan þess vinnusvæðis sem hann er í.

> „GLÖGGT segir mér hvar ég er — hliðarstikan segir mér hvað ég get gert hér.“

Einnig stendur áfram:

- fyrirtækið er vinnusamhengi, ekki bara síða í hliðarvalmynd;
- Home er stutt stöðuyfirlit og aðgerðapunktur, ekki önnur útgáfa af öllum einingum;
- Stjórnun er sameiginlegt fyrirtækisstjórnunarlag;
- Innsýn er skilnings-/greiningarlag;
- áskrift/einingar, heimildir og sýnileiki eru aðskilin lög;
- hlutverk og heimildir stýra því sem notandi sér, en við byggjum ekki gjörólík kerfi fyrir hverja notendategund.

Núverandi hliðarstika fylgir þessu ekki enn. Hún er flatur listi yfir bæði vinnusvæði, undirsíður og kerfisaðgerðir.

---

## 2. Staða núverandi leiðarkerfis

### Núverandi desktop shell

`components/Sidebar.tsx` sýnir í einni fastri hliðarstiku m.a.:

- GLÖGGT Admin
- Heim
- Fyrirtæki
- Skilaboð
- Sala
- Laun
- Birgðir
- Óunnin fylgiskjöl
- Bókuð fylgiskjöl
- Banki
- VSK
- Innsýn
- Vinnustundir
- Verk
- Stjórnun
- Mínar stillingar

Þetta blandar saman:

1. alþjóðlegri leiðsögn;
2. fyrirtækjaskiptum;
3. sjálfstæðum vinnusvæðum;
4. undirsíðum eins vinnusvæðis;
5. notandastillingum;
6. GLÖGGT Admin.

Dæmi: `Óunnin fylgiskjöl` og `Bókuð fylgiskjöl` eru tvær sidebar-línur þó þær eigi eðlilega heima sem undirsýnir innan Bókhalds. Sama gildir um Banka og VSK.

### Fjöldi route-síðna

Ferska `app` safnið hefur **90 `page.tsx` route-síður**.

Stærstu route-fjölskyldur:

- Fyrirtæki: 13
- Banki: 12
- Mobile: 11
- Verk: 8
- Stjórnstöð/Admin: 8
- Fylgiskjöl: 8

Þetta er nægilega stórt kerfi til að flatur sidebar geti ekki verið langtímaleiðin.

---

## 3. Tillaga – tvö lög leiðarkerfis

### Lag A – Aðalleiðarkerfi / vinnusvæðaval

Aðalleiðarkerfið segir **hvar notandinn er**. Það velur vinnusvæði en reynir ekki að sýna allar undirleiðir þess.

Vinnusvæði birtast aðeins ef áskrift/heimildir leyfa:

- Heim
- Bókhald
- Verk
- Vinnustundir
- Sala
- Birgðir
- Laun
- Innsýn
- Stjórnun
- GLÖGGT Admin (aðeins ADMIN)

Skilaboð, tilkynningar, persónulegar stillingar og fyrirtækjaskipti eiga frekar heima í sameiginlegum shell/header-aðgerðum en sem sambærileg „eining“ við Verk eða Bókhald.

### Lag B – Hliðarstika innan vinnusvæðis

Hliðarstikan svarar: **hvað get ég gert hér?**

Dæmi – Verk:

- Dagskipulag
- Verkabanki
- Kort
- Tæki og búnaður
- Verklyklar
- Vinnutími / reglur
- síðar skýrslur þegar þær eru raunverulega til

Dæmi – Bókhald:

- Óunnin fylgiskjöl
- Skjalasafn / bókuð
- Banki
- Afstemming
- VSK og skil
- ársuppgjör þegar það er orðið eiginlegt vinnuflæði

Dæmi – Stjórnun:

- Yfirlit
- Notendur og heimildir
- Einingar / áskrift
- GLÖGGT Mobile
- Fyrirtækisreglur
- einingasértækar stillingar eftir áskrift

### Fyrirtækjasamhengi

Virkt fyrirtæki verður sýnilegt í sameiginlega shell-inu. Að skipta fyrirtæki skiptir vinnusamhengi en notandi þarf ekki að velja fyrirtæki aftur inni í hverri einingu.

Ef ekkert fyrirtæki er tengt er Home í hlutlausri fjöl-fyrirtækjasýn fyrir verkefni/athygli.

---

## 4. Verk – niðurstaða heildarúttektar

### 4.1 Work10Dashboard er orðið monolith

`app/verk/Work10Dashboard.tsx`:

- **5.302 línur**
- um **301 KB** source
- 18 `useState`
- 30 `useMemo`
- 3 `useEffect`

Í sömu client-skrá eru m.a.:

- Dagskipulag;
- starfsmannalisti/virtualization;
- tímalína;
- snapshot-staða;
- drag-and-drop úthlutun;
- hægra Verk-spjald;
- mönnunartillögur;
- dagmönnun;
- tímabilsmönnun;
- ferðareikningur;
- Verklisti;
- Kort;
- Tækjasýn;
- placeholder flipar;
- neðri samantektarkort sem sjást óháð aðalflipa.

Þetta gerir bæði viðhald og render-útreikninga óþarflega víðtæka.

### 4.2 Dagskipulag er of mikið skoðun, of lítið stjórntæki

Nú er hægt að:

- leita og sía fólk;
- draga fólk á Verk/Verkþátt;
- sjá dagstímalínu;
- breyta dagsetningu/upphafstíma í hægra spjaldi;
- sjá vinnu, mönnun og stöðu.

En stjórnandi getur ekki enn unnið daginn eins eðlilega og markmiðið krefst:

- ekki draga Verk úr Verkabanka beint inn á tíma;
- ekki draga Verk eftir tímalínunni til að færa það;
- ekki færa Verk á milli starfsmanna/teyma sem eina sýnilega skipulagsaðgerð;
- ekki sjá tillögu frá mönnunarvél beint sem editable preview á tímalínunni;
- ekki endurskipuleggja „frá núna“ með tillögu og staðfestingu.

### 4.3 Mönnun er á röngum stað

Mikið af sterkustu dagmönnunar- og tímabilsmönnunarvirkninni er nú undir `Verkalisti`-sýninni.

Arkitektúrlega á hún að tengjast Dagskipulagi:

`Búa til tillögu → forskoða á tímalínu → breyta → staðfesta`.

Verkalisti á ekki að verða annað stjórnborð.

### 4.4 Dagur / Vika / Mánuður er villandi núna

`calendarMode` hefur gildin `day | week | month`, en aðeins `day` hefur sértæka hegðun/renderingu. Vika og Mánuður skipta aðallega um textamerki; þau fá ekki raunverulega eigin sýn.

Niðurstaða:

- annaðhvort fela Viku/Mánuð þar til þær eru raunverulegar;
- eða smíða þær sem ólíkar sýnir með eigin gagnasókn og tilgangi.

Ekki láta notanda halda að þrjár fullar sýnir séu til þegar aðeins ein er raunverulega útfærð.

### 4.5 Placeholder-flipar eiga út

`Raðverk`, `Skjöl` og `Skýrslur` hafa ekki öll sjálfstætt fullgilt innihald.

Tillaga:

- Raðverk verður röðun/sía innan **Verkabanka**;
- Skjöl birtast fyrst og fremst á Verki/Verkþætti eða í sér skjalavinnusvæði þegar global notagildi er skýrt;
- Skýrslur verða sýnilegar þegar raunverulegt skýrslusvæði er komið.

### 4.6 Hægra spjaldið þarf að verða raunvirkt

Nú sýnir það haus eins og:

`Fólk | Vélar | Skjöl | Athugasemdir`

en aðeins Fólk er raunverulega virkt tab-efni í sama skilningi.

Hægra spjaldið ætti að verða lifandi stjórnun á valda Verkinu með raunverulegum flipum, t.d.:

- Yfirlit
- Fólk / teymi
- Tími
- Tæki
- Verkþættir
- Skjöl
- Athugasemdir

Aðeins virkur hluti á að rendera/fetch-a sitt efni.

### 4.7 Neðri global-kort eiga að hverfa úr öllum flipum

Eftir aðalflipa renderast nú óháð flipa m.a.:

- óvirkt „Nýtt verk“ form;
- lítið Raðverk-kort;
- Tæki-kort;
- Staða dagsins;
- Fljótlegar aðgerðir.

Þetta veldur tvíverknaði og ruglar merkingu vinnusvæðisins. Hluti þess á í Dagskipulagshaus/statusstrip, hluti í Verkabanka og hluti á alls ekki að vera sýnilegur.

---

## 5. Verk – afkastavandamál sem sjást í kóðanum

### 5.1 `/verk` sækir allt áður en fyrsta sýn birtist

`app/verk/page.tsx` keyrir í einu `Promise.all` stórt safn queries, m.a.:

- **öll WorkOrder fyrirtækisins**;
- translations;
- departments/locations;
- **alla legacy WorkLog** fyrir hvert Verk;
- alla WorkPart;
- staffing requirements;
- virkar assignments;
- **alla laborFacts** fyrir work parts;
- dependencies;
- alla virka starfsmenn með teymum, hæfni, hlutverkum og work scopes;
- öll tæki;
- **alla PERSON assignmentHistory**;
- vinnustaðarprófíla;
- kjarasamningsprófíla;
- ferðaleiðir;
- **allar EmployeeWorkDiaryEntry fyrirtækisins**.

Þetta er síðan normalíserað á server og stór hluti sendur sem einn `Work10DashboardData` JSON-pakki í 5.302 línu client-component.

Afleiðing: að opna bara Dagskipulag greiðir fyrir gögn sem aðeins Verklisti, tímabilsmönnun eða önnur sýn þarf.

### 5.2 Pairing history er reiknað við hvert `/verk` load

Öll `WorkPartAssignment` saga fyrir fólk er sótt og síðan er sögulegt samstarf starfsmanna reiknað með nested lykkjum eftir Verkþætti.

Þetta er gagnlegt fyrir mönnunartillögur en á ekki að vera skyldukostnaður við hvert venjulegt Dagskipulag-load.

### 5.3 Tillaga að nýrri gagnasókn fyrir Verk

**Dagskipulag:**

- valinn dagur;
- fólk/teymi sem þarf fyrir daginn;
- Verk dagsins;
- takmarkaður backlog/verkabanki;
- núverandi vinnustaða;
- nauðsynleg tæki/ferðagögn.

**Verkabanki:**

- paginated / incremental fetch;
- aðeins summary fields í lista;
- smáatriði sótt þegar Verk opnast/velst.

**Mönnunartillaga:**

- sækja pairing/hæfni/period data þegar notandi biður um tillögu;
- ekki fyrir hvert venjulegt page load.

**Kort:**

- áfram lazy/date-scoped eins og nýja GPS-kortið gerir.

**Tæki:**

- sér route/sýn; ekki fullur tækjapakki inn í allt Verk nema það sé nauðsynlegt.

---

## 6. Kerfislægt afkastavandamál – request context er endurreiknað

Þetta er líklega einn besti „allur kerfið verður léttara“ áfanginn.

### Dæmi `/verk`

Áður en stóra Verk-queryið er unnið getur sami request farið í gegnum:

1. `RootLayout` – session, virkur notandi, virkt fyrirtæki, UserCompany, UserSettings, CompanyModule;
2. `requireCompanyModule("verk")` – session, UserCompany og CompanyModule aftur;
3. `getEffectiveUser()` – session aftur og mögulega impersonated user aftur;
4. síðan sækir Verk-síðan UserSettings aftur.

Þetta er ekki einstakt fyrir Verk. `prisma.session.findUnique` finnst í um **31 app/lib skrá** í snapshotinu.

### Nýtt kerfislög

Búa til request-scoped samhengi sem reiknar einu sinni:

- authenticated session;
- session user;
- effective/impersonated user;
- active company;
- company access;
- interface language;
- module entitlements/settings.

Síðan nota RootLayout, require-helpers og síður sama context innan request.

Mikilvægt: þetta á að vera request-scoped memoization, ekki langlíft cache sem gæti geymt úreltar heimildir milli requesta.

---

## 7. Aðrir þungir staðir sem fundust

Þetta er static code audit, ekki mældur production-profiler. Engar ms-tölur eru fullyrtar án mælinga.

### Innsýn

`app/innsyn/page.tsx` er um **3.690 línur** og hefur a.m.k. 14 beinar Prisma-query tilvísanir.

Sérstaklega þungt:

- öll Receipt fyrirtækisins með booking entries;
- stór InsightEntity/Fact söfn;
- sér incomeFacts query upp í 1.000 færslur;
- og síðan **allar bankafærslur allra virkra bankareikninga**, yfir öll ár, til að reikna nýjasta ársyfirlit í hvert skipti sem Innsýn opnast.

Tillaga:

- Innsýn aðalsíða fær summary/gagnalag;
- bankabrú og ársgreining lazy eða cached per company/year/data-version;
- ekki lesa alla bankasögu bara til að opna Innsýn.

### Banki → Ársgreining

`app/banki/arsgreining/page.tsx` les **allar bankafærslur allra ára**, finnur síðan ár í JavaScript og síar niður í valið ár.

Betra:

1. finna nýjustu dagsetningu / valið ár;
2. sækja aðeins date range þess árs;
3. sækja annað ár aðeins þegar notandi velur það.

### Heim

Heim sækir m.a. heilt Receipt-safn virka fyrirtækisins með AI documents til að telja stöður. Í hlutlausri fjöl-fyrirtækjasýn eru receipt/task gögn margra fyrirtækja dregin inn og talin í JS.

Betra:

- count/summary queries;
- sér `home summary` query/service;
- ekki flytja heilu skjölin þegar aðeins fjöldi þarf.

`ensureCompanyStatutoryTasks()` keyrir líka þegar Home opnast; meta þarf hvort task-generation eigi að vera request-kostnaður forsíðunnar eða sérstakt idempotent scheduler/periodic lag.

### Fylgiskjöl

Óunnin fylgiskjöl sækja öll óapproved Receipt og fulla `company` relation fyrir hverja færslu ásamt AI documents, án pagination.

Betra:

- company name kemur úr active context einu sinni;
- select aðeins þau document fields sem listinn sýnir;
- pagination/infinite list þegar magn vex.

---

## 8. Mælingar sem verða hluti af refactor

Við eigum ekki að meta hraða eftir tilfinningu eingöngu.

Bæta við development-only mælingu á lykilsíðum:

- request context ms;
- DB query-lota ms;
- server transformation ms;
- approximate serialized payload size;
- client mount/render þar sem við á.

Fyrstu mælipunktar:

1. Heim
2. Verk / Dagskipulag
3. Innsýn
4. Banki / Ársgreining
5. Fylgiskjöl

Við berum saman fyrir/eftir og höldum niðurstöðum í vinnudagbók.

---

## 9. Forgangsröðuð framkvæmd

### Áfangi 0 – frysta GPS-prófið

Engin breyting á GPS-söfnun áður en akstursprófið til Reykjavíkur er búið. UI/arkitektúrvinna má halda áfram.

### Áfangi 1 – Shell / navigation grunnur

- skilgreina aðalleiðarkerfi vinnusvæða;
- virkt fyrirtæki sem stöðugt samhengi;
- contextual sidebar fyrir vinnusvæði;
- entitlement/role-driven sýnileiki;
- GLÖGGT Admin aðskilið frá fyrirtækisstjórnun;
- engar route-breytingar nauðsynlegar í fyrstu útgáfu – hægt að umbreyta shell fyrst.

### Áfangi 2 – request context / afkastagrunnur

- eitt request-scoped auth/company/language/module context;
- fjarlægja endurteknar session/access/module queries úr layout + require helpers;
- mæla áhrif.

### Áfangi 3 – Verk klofið í raunveruleg vinnusvæði

- `/verk` = Dagskipulag / stjórnstöð dagsins;
- Verkabanki sem sér sýn/route;
- Kort lazy og dagsett;
- Tæki heldur sér í sér route;
- Verklyklar og Vinnutími contextual sidebar;
- placeholder tabs fjarlægðir;
- `Work10Dashboard.tsx` brotið í smærri einingar.

### Áfangi 4 – Dagskipulag verður stjórntæki

- drag Verk úr Verkabanka → tími;
- drag/færa Verk á tímalínu;
- mönnunartillaga sem preview á tímalínu;
- breyta preview → staðfesta;
- „Endurskipuleggja frá núna“ sem tillaga, aldrei sjálfvirk breyting án staðfestingar;
- hægra spjald verður raunvirkt.

### Áfangi 5 – þungu gagnasvæðin

- Innsýn bankagögn lazy/cached;
- Ársgreining date-scoped;
- Home summary queries;
- Fylgiskjöl select/pagination;
- fleiri svæði eftir mælingum.

---

## 10. Ekki gera

- Ekki bæta fleiri stórum eiginleikum í núverandi flata sidebar.
- Ekki bæta fleiri state/memo blokkum við 5.302 línu Work10Dashboard sem langtímalausn.
- Ekki hlaða gögn allra flipa til að sýna einn flipa.
- Ekki nota cache á heimildir yfir request-mörk án skýrrar invalidation-stefnu.
- Ekki breyta GPS-söfnun áður en morgunprófið er búið.
- Ekki refactora gagnalíkan bara til að laga UI ef núverandi sannleikslög duga.

---

## 11. Niðurstaða

Prófanir síðustu daga voru ekki frávik frá arkitektúrnum; þær gáfu okkur upplýsingar sem vantaði til að klára hann.

Verk er nú nógu raunverulegt til að sjá hvað þarf að breytast:

- stjórnandasýnin þarf að verða aðgerðamiðuð;
- navigation þarf að verða contextual;
- gagnasókn þarf að verða view-scoped;
- sameiginlegt request context þarf að draga úr tvíverknaði;
- þungar greiningar þurfa lazy/cached gagnalög.

Rétta næsta skrefið er því ekki að bæta einum takka við Dagskipulag. Það er að smíða **nýja shell/navigation grunninn og afkastagrunninn**, og færa síðan Verk inn í þann ramma með þeirri virkni sem raunprófanirnar hafa kennt okkur að þarf.
