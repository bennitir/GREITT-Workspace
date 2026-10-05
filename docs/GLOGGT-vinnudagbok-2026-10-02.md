# GLÖGGT – vinnudagbók 2. október 2026

**Dagsetning:** föstudagur 2. október 2026  
**Óskað tímabil:** frá kl. 07:00 til dagsloka, rétt fyrir miðnætti  
**Fyrsta beint skjalfesta vinna í tiltæku samhengi:** um kl. 07:57  
**Meginþemu dagsins:** Festa/document-instance duplicate-vörn, trusted evidence og PostgreSQL læsingar, VSK-yfirferð Sturlu Ólafssonar, lagfæring á VSK-vali fylgiskjala, deterministic Nova-lestur og endurtekinn bókunarlærdómur, 75% innskattsfrádráttur, rannsókn á kortainnflutningi og loks nákvæm greining á 22 fölskum „Tilbúið“ kortafærslum.

---

## 1. Yfirlit dagsins

2. október varð mjög afkastamikill dagur með tveimur stórum vinnulotum sem tengdust þó báðar sömu meginstefnu GLÖGGT: **gögn fyrst, rekjanleiki, deterministic hegðun og fail-closed þegar gögnin eru ekki nógu örugg.**

Dagurinn hófst í `C:\GLÖGGT` með framhaldi af Festa/Landsbankinn duplicate-vörninni. Sala-worktree-ið `C:\GLÖGGT-SALA` á branch `feature/sala-v1` var vísvitandi látið alveg ósnert.

Morgun- og hádegisvinnan færði document-instance grunninn úr pure/service-hönnun yfir í raunverulega production-staðfesta PostgreSQL hegðun með trusted original artifact, evidence verification, tenant-scoped service og advisory locking.

Síðdegis og kvöld fór vinnan yfir í raunbókhald Sturlu Ólafssonar. Þar kom í ljós að VSK-síðan hafði valið bókuð fylgiskjöl of þröngt og sleppt bæði sölu og innskatti sem voru raunverulega bókuð. Það leiddi til almennrar lagfæringar á VSK-valinu og breytti tölum á fleiri tímabilum.

Kvöldið fór síðan í Nova-reikninga og deterministic endurbyggingu. Rangur línulestur `189 -> 1.189` var lagaður almennt, recurring booking var styrkt þannig að eldri staðfestar Nova-bókanir gætu kennt nýjum reikningum, og 75% fyrirtækjasértæk VSK-regla Sturlu fór loks að nýtast sjálfkrafa í réttu samhengi.

Dagslokin urðu svo mjög skýr rannsóknarlota á Platinum-kortainnflutningi. Þar fannst raunverulegur duplicate-galli: 22 færslur sem UI merkti grænar „Tilbúið“ voru allar þegar til. Einasti munurinn var **1 millisekúnda í falda Excel-tímanum**. Það er nú nákvæmlega afmarkað næsta lagfæringarverk.

---

# 2. Festa / document-instance – morgunlota

## 2.1 Vinnusvæði og varúðarreglur

Unnið var í:

`C:\GLÖGGT`

Sala var ekki snert:

`C:\GLÖGGT-SALA` / `feature/sala-v1`

Að morgni voru Astra/service-breytingar enn ócommit-aðar í aðal-workspace og production duplicate-vörnin var því ekki enn komin með nýja service-lagið.

Fastar reglur héldu allan áfangann:

- engin `prisma format`;
- engin tilviljanakennd production DB write;
- engin blöndun við Sala-worktree;
- tenant-scope og fail-closed behaviour verður að halda;
- sama skuldbinding má eiga fleiri en eitt gilt document instance;
- sama nákvæma instance má ekki sleppa í gegn sem nýtt skjal.

---

## 2.2 Document-instance identity service

Prisma adapter var tengdur við service-lagið og validation var keyrð.

Niðurstaða:

- **68/68 focused tests græn**;
- `prisma generate` gekk;
- `npx tsc --noEmit` hreint;
- `git diff --check` hreint.

Commit:

`d680cf0` – **Add document instance identity service**

Commitið var push-að og production varð Ready.

Mikilvægt: þessi breyting krafðist **engrar migration og engrar production DB write**.

---

## 2.3 Trusted evidence verifier

Næsta lag var að tryggja að document-instance confirmation treysti ekki browser-supplied gögnum eða bara geymdri digest.

Nýja evidence-lagið endurstaðfestir:

- rétt company;
- rétt receipt;
- rétt detected document;
- rétt obligation binding/revision;
- rétt blaðsíðuuppruna;
- authoritative source file hash;
- evidence text úr raunverulegu frumskjali.

Commit:

`489c0eb` – trusted document instance evidence verifier.

Grundvallarreglan varð:

> Identity confirmation má aðeins byggja á varðveittu, sannprófuðu frumskjali; PROPOSED metadata eitt og sér gefur enga duplicate-undanþágu.

---

## 2.4 Trusted original artifact loader

Síðan var bætt við loader fyrir authoritative frumskjalið.

Fastar reglur:

- Supabase bucket: `fylgiskjol`;
- `Receipt.fileHash` er content identity;
- company/receipt/document scope verður að stemma;
- storage-path verður að vera tenant-scoped undir company-prefix;
- downloaded bytes eru SHA-256 sannprófuð gegn persisted `fileHash`;
- legacy local `filePath` er ekki talið nægilegt authoritative evidence.

Commit:

`8b079be` – trusted original document artifact loader.

---

# 3. Raunveruleg PostgreSQL integration-prófun

## 3.1 Sér test-gagnagrunnur

Notaður var sérstakur Supabase/Postgres test-gagnagrunnur:

`gloggt-integration-test`

Við fyrstu tilraun kom í ljós að test DB var langt á eftir með migrations og gat ekki bara keyrt fulla migration-sögu frá núverandi ástandi. Hann var sannreyndur sérstaklega sem test-URL, ekki production, og síðan örugglega resettaður/samstilltur við núverandi Prisma schema áður en integration-prófun hélt áfram.

---

## 3.2 PostgreSQL advisory lock – raunverulegur driver-galli fannst

Við integration-prófun kom í ljós raunverulegt Prisma/Postgres atriði:

`pg_advisory_xact_lock()` skilar `void`.

Prisma gat ekki deserialize-að því svari beint.

Kóðinn var lagaður þannig að transaction-scoped advisory lock héldi nákvæmlega sömu hegðun en SQL-framsetningin skilaði Prisma lesanlegu integer-gildi.

Þetta var ekki bara unit-test vandamál heldur raunverulegur runtime-samspilspunktur milli Prisma og PostgreSQL.

---

## 3.3 Cleanup/FK vandamál í test fixture

Integration-testið festist tímabundið á cleanup-röð:

`Receipt_companyId_fkey`

Ástæðan var að test fixture reyndi að eyða `Company` áður en tengd `Receipt` gögn voru farin.

Eftir lagfæringu á fixture/cleanup tókst raunveruleg PostgreSQL integration-prófun að fullu.

---

## 3.4 Loka integration-sönnun – 6/6 græn

Öll sex mikilvæg concurrency/atomicity prófin urðu græn:

1. Sama fyrirtæki serialiserast með advisory lock.
2. Mismunandi fyrirtæki blokka ekki hvort annað.
3. Audit + metadata rollback-a atomic.
4. Tvö eins concurrent confirm skila einu audit + idempotent replay.
5. Tvö mismunandi concurrent confirm geta ekki bæði neytt sömu gömlu revision.
6. Advisory-lock namespace er stöðugt og nonzero.

Loka commit:

`14b99ef` – **Verify document identity locking in PostgreSQL**

Commitið var push-að og Vercel Production varð Ready.

---

# 4. Festa checkpoint – hvað er komið og hvað er ekki komið

Í lok Festa-lotunnar var sérstakur checkpoint-texti varðveittur:

`docs/GLOGGT-FESTA-CHECKPOINT-2026-10-02.md`

Það sem er nú production-staðfest undirliggjandi vél:

- document instance comparison;
- duplicate reason evaluation;
- versioned envelope state;
- authoritative identity service;
- evidence verifier;
- trusted original artifact loader;
- PostgreSQL advisory locking og concurrency-sönnun.

En **Festa-málið er ekki enn end-to-end lokað**.

Næsta Festa-röð er föst:

1. duplicate candidate reevaluation;
2. production confirm/invalidate wiring;
3. sameiginleg company lock á öllum duplicate-relevant writers;
4. atomic duplicate reevaluation;
5. raunverulegt Festa acceptance-test með 16/480, 17/480 og endurhleðslu á sama instance.

Ekki á að segja „Festa er lagað“ fyrr en þessi fimm skref eru komin í production og acceptance-prófið er grænt.

---

# 5. VSK Sturlu – raunveruleg bókhaldsyfirferð

Síðari hluti dagsins fór í að klára VSK-vinnu Sturlu Ólafssonar og bera GLÖGGT saman við áður skilaðar tölur.

Þar fannst mikilvæg almenn villa: VSK-síðan valdi parent `Receipt.status = APPROVED` of þröngt og gat því sleppt bókuðum `AiDetectedDocument` eða legacy booking-línum þegar parent receipt hafði ekki nákvæmlega þá stöðu sem VSK-sían bjóst við.

Þetta var gagnavalsvilla, ekki VSK-reikniregla.

---

## 5.1 Janúar–febrúar fyrir lagfæringu

GLÖGGT hafði sýnt:

- A: **440.000 kr.**
- D: **105.600 kr.**
- E: **1.881 kr.**
- F/H: **103.719 kr.**

Gamla skilaða VSK-skýrslan hjá Skattinum var:

- A: **830.000 kr.**
- D: **199.200 kr.**
- E: **0 kr.**
- H: **199.200 kr.**

Rannsóknin fann að GLÖGGT hafði sleppt bókaðri sölu:

- 06.01.2026 – Sturla Ólafsson – 483.600 kr. brúttó
- 390.000 kr. nettó
- 93.600 kr. útskattur
- fylgiskjal #450

og einnig innskattsfærslu sem hafði dottið út sama leið.

Saman með 04.02.2026 sölunni #457 urðu útskattstölurnar nákvæmlega:

- A: **830.000 kr.**
- D: **199.200 kr.**

sem staðfesti að grunngögnin voru til en VSK-valið rangt.

---

## 5.2 Almenn lagfæring á VSK-valinu

Lagfæringin náði til:

- `app/vsk/page.tsx`
- `lib/vat/receipt-selection.ts`
- `lib/vat/receipt-selection.test.ts`

Nýja valið tekur rétt með:

- bókuð `AiDetectedDocument` þó parent Receipt sé ekki `APPROVED`;
- legacy receipt-level booking þegar child documents eru til en hafa ekki eigin booking lines.

Þetta var almenn lagað regla, ekki sérkóði fyrir Sturlu.

---

## 5.3 Janúar–febrúar eftir lagfæringu

Eftir breytinguna varð GLÖGGT:

- A: **830.000 kr.**
- D: **199.200 kr.**
- E: **2.265 kr.**
- F/H: **196.935 kr.**

Innskattslínur sem komu inn:

- Nova 31.01 – 941 kr.
- Olís 07.02 – 384 kr.
- Nova 28.02 – 941 kr.

Athugun sem stendur enn:

941 + 384 + 941 = 2.266 kr. sýnt á línum, en headline er 2.265 kr.

Þessi 1 kr. munur þarf að vera rannsakaður út frá underlying decimal/rounding áður en honum er handbreytt.

---

# 6. Mar–apr og maí–jún – áhrif lagfæringarinnar

## 6.1 Mars–apríl

Eftir VSK-selection lagfæringuna sýndi GLÖGGT:

- A: **1.110.000 kr.**
- D: **266.400 kr.**
- E: **2.781 kr.**
- F/H: **263.619 kr.**

Áður en frekari leiðrétting er send þarf að bera þetta við nákvæmlega hvað var áður skilað hjá Skattinum.

---

## 6.2 Maí–júní

Fyrr um daginn var leiðrétting þegar send til Skattsins með:

- E: **4.521 kr.**
- H: **374.679 kr.**

og sú leiðrétting tókst.

Eftir almenna VSK-selection lagfæringuna sýndi GLÖGGT hins vegar:

- A: **1.580.000 kr.**
- D: **379.200 kr.**
- E: **4.813 kr.**
- F/H: **374.387 kr.**

Munurinn er **292 kr.**, sem kom frá Olís-fylgiskjali sem hafði áður dottið út úr VSK-valinu.

Því virðist maí–júní enn þurfa viðbótarleiðréttingu, en aðeins eftir loka validation á underlying entries.

---

# 7. Júlí–ágúst – staða áður en Nova var kláruð

Fyrir Nova-lagfæringarnar sýndi GLÖGGT:

- A: **1.530.000 kr.**
- D: **367.200 kr.**
- E: **30.825 kr.**
- F/H: **336.375 kr.**

Nova-reikningar fyrir júlí og ágúst voru ekki inni í þessari tölu á þeim tímapunkti.

Tvær Nova-bókanir með 75% frádráttarbærum innskatti gefa hvor um sig **984 kr.** í innskatt þegar þær eru rétt bókaðar.

Ef báðar eru endanlega bókaðar og ekkert annað vantar ætti júlí–ágúst því að hækka um 1.968 kr. í innskatti. Þetta þarf þó að staðfesta með refresh eftir bókun, ekki bara reikna fyrirfram.

---

# 8. Rannsókn á „vantar Nova“ – var einhverju eytt?

Rannsakað var hvort júlí-/ágúst-Nova hefði verið hlaðið inn og síðar eytt.

Niðurstaðan:

- enginn exact Nova July/Aug document var þá í DB;
- 18 orphan Storage files fundust;
- þar á meðal gömul Nova-lík skrá `BR2512-7690927.pdf`;
- enginn orphan `BR2607` eða `BR2608` fannst;
- enginn viðeigandi audit fannst.

Mikilvæg kerfisniðurstaða:

- „afgreitt án bókunar“ er rekjanlegt með disposed/audit;
- hard-delete á óbókuðu detected document/receipt getur hins vegar eytt DB-slóð án fullnægjandi audit-ferils;
- storage-object getur jafnvel lifað hard-delete af.

Engin sönnun fannst fyrir því að AI hefði sjálft eytt Nova-skjölunum.

Read-only diagnostic scripts voru útbúin fyrir þetta og eru áfram diagnostic vinnuskrár, ekki production-kóði.

---

# 9. Nova júlí – deterministic parser galli fannst

Júlí Nova-reikningurinn:

- reikningur: `BR2607-2140760`
- dagsetning: **31.07.2026**
- samtals: **6.779 kr.**
- Farsími: **6.590 kr.**
- Stofnun kröfu í heimabanka: **189 kr.**
- VSK-stofn: **5.467 kr.**
- VSK 24%: **1.312 kr.**

Fyrsti deterministic lesturinn var fljótur og án AI, en booking reconstruction var rangt:

- kerfið fann 8 „vörulínur“;
- aðeins ein fékk örugga reikningstengingu;
- `Stofnun kröfu 189` varð ranglega að **1.189 kr.**

Orsökin var að labeled purchase invoice var látinn fara í POS/receipt purchase-line parser sem hentaði ekki þessari skjalategund.

---

# 10. Almenn Nova/labeled invoice lagfæring

Bætt var við almennum deterministic extractor fyrir labeled purchase invoices.

Reglurnar:

- les nákvæmlega prentaðar þjónustulínur;
- samþykkir þær aðeins ef línuheild stemmir nákvæmlega við invoice total;
- fail-closed ef reconciliation stemmir ekki;
- engin Nova-hardkóðun;
- engin AI-fallback þörf þegar deterministic gögn duga.

Niðurstaða á Nova:

- `Farsími 6.590`
- `Stofnun kröfu í heimabanka 189`

rétt lesið sem **2 línur**, ekki 8.

Nýjar/uppfærðar skrár:

- `app/actions/receiptActions.ts`
- `lib/receipts/ingestion.ts`
- `lib/receipts/recurring-booking.ts`
- `lib/receipts/recurring-booking.test.ts`
- `lib/receipts/ingestion-labeled-purchase-lines.test.ts`

---

# 11. Recurring booking – fyrirtækjasértækur lærdómur

Fyrsta útgáfa recurring booking gat endurnýtt stabilt debit/credit pattern úr að minnsta kosti tveimur eldri reviewed comparable documents.

Reglur:

- sama company;
- sami merchant;
- sama total;
- sama exact line signature;
- minnst tvö prior reviewed documents;
- debit má endurnýta ef stöðugt;
- credit má aðeins endurnýta ef fyrri dæmi eru samhljóða;
- ef credit-account er ekki stöðugur er fail-closed.

Fyrsta validation varð:

**7/7 próf græn**

með meðal annars prófum fyrir:

- nákvæman labeled invoice extraction;
- fail-closed reconciliation;
- no-AI deterministic invoice;
- company-local recurring line signature;
- tvö prior documents kenna stable booking;
- eitt prior document er ekki nóg;
- mismunandi credit-account varðveitir debit en fail-ar closed á credit.

Auk þess:

- `npx tsc --noEmit` hreint;
- `git diff --check` hreint.

---

# 12. Legacy history gap og recurring-history fix V2

Fyrsta endurbygging eftir parser-fix gaf rétt 2 línur og lagaði 189 kr. gjaldið, en recurring booking nýtti ekki alla söguna.

Orsökin:

Eldri Nova-fylgiskjöl höfðu legacy AI/template metadata og nýja lookup-ið var of strangt áður en það fékk að endurlesa þau með núverandi deterministic template.

Lagfæringin var því gerð almennt:

- eldri reviewed same-merchant skjöl mega vera deterministic endurlesin í minni;
- exact same total og line signature verða áfram að stemma;
- minnst tvö reviewed dæmi;
- stable debit pattern;
- stable credit aðeins ef history er samhljóða;
- enginn Nova-hardkóði.

Fyrsta patch gaf TypeScript villu vegna nullable `prior.pageNumber`.

Það var lagað í V2 með local narrowing áður en async vinnsla fer af stað.

---

# 13. Nova ágúst – sjálfvirka niðurstaðan fór loks rétt

Á ágúst Nova-reikningnum kom kerfið síðan sjálft upp með rétta endurbyggingu.

Reikningur:

- `BR2608-6685133`
- dagsetning: **31.08.2026**
- samtals: **6.779 kr.**

Deterministic reconstruction fann:

- 2 vörulínur;
- 2 öruggar reikningstengingar.

Bókunin varð:

- 4400 Farsími/áskrift, án VSK: **5.315 kr. D**
- 4980 Stofnun kröfu, án VSK: **152 kr. D**
- 2520 frádráttarbær innskattur 75%: **984 kr. D**
- 4400 ófrádráttarbær VSK 25%: **328 kr. D**
- 2000 greiðslureikningur: **6.779 kr. K**

Debet og kredit stóðu á **6.779 kr.**

Þetta staðfesti að línuskipting og VSK-skipting voru nú arithmetically rétt:

- nettó: 5.315 + 152 = 5.467
- VSK: 984 + 328 = 1.312
- samtals: 6.779

---

# 14. 75% innskattsfrádráttur – byrjaði að koma sjálfkrafa

Á Nova-reikningnum birtist fyrirtækjasértæka 75% innskattsreglan sjálfkrafa þegar reconstruction varð rétt.

Sýnilegt í UI:

- VSK á reikningi: **1.312 kr.**
- frádráttarbær innskattur: **984 kr.**
- ófrádráttarbær VSK: **328 kr.**
- frádráttarhlutfall: **75%**

Mikilvægt:

Þetta var ekki nýr „lærdómur“ frá Nova-patchinu sjálfu. Það var fyrirliggjandi fyrirtækjasértæk VSK-regla Sturlu sem varð nú loks rétt nothæf þegar deterministic booking reconstruction gaf rétta uppbyggingu.

---

# 15. UI-gallar sem komu í ljós við Nova

Þrjú lítil en mikilvæg UI-atriði komu skýrt í ljós:

### A. VSK-skýring / reason
Textinn við 75% „Ástæða / skýring“ vistast ekki eðlilega með venjulegum bókunarbreytingum þegar booking lines eru dirty. Notandinn þarf óþarflega að vista línur fyrst og síðan nota hlutfallsaðgerðina.

Rétt framtíðarhegðun:

- skýring vistist sjálfstætt eða með `Vista breytingar`;
- hún týnist ekki vegna dirty booking lines.

### B. „Endurbyggja tillögu úr staðfestum gögnum“ vantar feedback
Hnappurinn sýnir ekki skýrt pending/success/error state.

Óskað:

- `Endurbyggi…`
- disable á meðan;
- sýnileg lokastaða `Tillaga endurbyggð` eða villa.

### C. Rangt millistöðu-flash
Við opnun/endurbyggingu gat gamla/ranga tillagan birst í augnablik og síðan hoppað í rétta.

Notandinn á ekki að sjá stale tillögu meðan ný deterministic reconstruction er í gangi.

---

# 16. Símakaup Nova 189.990 kr. – afmörkun frá VSK-lotunni

Í bankagögnum/kortagögnum kom einnig fram Nova-færsla:

- 17.09.2026
- **189.990 kr.**
- reference `S0001-LA01-107460`

Sturla á óbókuð símakaup fyrir sömu upphæð.

Niðurstaða:

Þetta er nánast örugglega sama símakaupið, ekki þriðji mánaðarlegi Nova-reikningurinn sem vantaði í júlí–ágúst.

Það tilheyrir sep–okt VSK-tímabili og var sett til hliðar svo vinna kvöldsins héldi fókus á júlí–ágúst og leiðréttingar fyrri tímabila.

---

# 17. Platinum kortainnflutningur – ný rannsókn undir dagslok

Seint um kvöld kom nýtt Excel-yfirlit í innflutning:

`Platinumvisa 4.6.2026 10.7.2026.xlsx`

Forskoðunin sýndi:

- færslur: **120**
- til innflutnings: **22**
- þegar innflutt: **98**
- villur: **0**

Fyrst vaknaði spurning hvort tímabilið hefði yfirleitt verið komið inn áður.

Það var rétt að stoppa áður en ýtt væri á `Staðfesta innflutning (22)`.

---

# 18. Provenance-rannsókn kortainnflutnings

Read-only diagnostic var útbúið:

`scripts/diagnose-platinum-import-provenance.ts`

Það sýndi:

- Platinum card #2 hjá Sturlu;
- eldri import batch #18 úr `platinum kort 2026.xlsx`;
- nýja preview batch #22;
- 120 núverandi DB-færslur á tímabilinu 01.06–10.07;
- allar 120 komu úr gömlu skránni `platinum kort 2026.xlsx`;
- `202606` og `202607` voru bæði þegar til.

Dæmi sem match-uðu nákvæmlega við DB:

- Almar Bakari 8.7 – 1.220 kr.
- Apótekarinn Selfossi 8.7 – 7.491 kr.
- Krónan Selfoss 8.7 – 6.054 kr.
- OB Fjarðarkaup 8.7 – 8.867 kr.
- Olís Hella 6.7 – 16.065 kr.
- ELKO Lindum 3.7 – 139.995 kr.

Þannig var staðfest að tímabilið hafði raunverulega verið flutt inn áður.

---

# 19. Gömlu og nýju Excel-skrárnar bornar saman

Gamla skráin var síðan skoðuð beint:

`platinum kort 2026.xlsx`

Hún innihélt margar af nákvæmlega sömu færslunum og nýja skráin, þar á meðal ýmsar sem UI hafði samt merkt grænar `Tilbúið`.

Dæmi:

- Hjólbarðaverkstæði Suðurnes – 13.500 kr.
- Ayurveda – 48.000 kr.
- Krónan Vík – 500 kr.
- Orkan Freysnes – 128 kr.
- Olís Hella – 13.085 kr.
- ELKO Lindum – 139.995 kr.
- Apótekarinn Vallakór – 6.282 kr.
- N1 Lækjargata – 650 kr.
- Skeiðalaug – 500 kr.
- Kemi – 4.927 kr.
- Olís Mjódd – 1.189 kr.

Þetta sýndi að `Tilbúið` gat ekki verið túlkað sem „örugglega ný færsla“.

---

# 20. Rót orsakarinnar – 1 millisekúnda

Annað read-only diagnostic var útbúið:

`scripts/diagnose-platinum-new-fingerprint-diffs.ts`

Það bar allar 22 grænu línurnar við eldri DB-færslur með sama sýnilega lykli.

Loka niðurstaða:

- NEW-línur alls: **22**
- með eldri sýnilega samsvörun: **22**
- án samsvörunar: **0**
- flokkun: **ONLY_DATETIME: 22**

Á öllum 22 var eini munurinn falinn tími í Excel-dagsetningunni.

Dæmi:

`2026-07-06T15:31:42.999Z`

gegn

`2026-07-06T15:31:43.000Z`

og sams konar 0,001 sekúndu munur á öllum öðrum.

Þannig var staðfest að **allar 22 grænu færslurnar eru false-new duplicates**.

---

# 21. Kortafingerprint – næsta nákvæma lagfæring

Núverandi duplicate fingerprint tekur of nákvæman timestamp með í identity.

Afleiðingin:

- sami raunverulegi kortaatburður;
- sami dagur;
- sami söluaðili;
- sama upphæð;
- sama card period;
- sömu önnur gögn;
- en 1 ms mismunur í Excel serialization;

=> nýtt fingerprint og rangt `Tilbúið`.

Næsta lagfæring þarf að normalisera timestamp áður en fingerprint er búið til.

Regression-próf þarf sérstaklega að sanna að t.d.:

- `12:17:58.999`
- `12:17:59.000`

með sömu öðrum transaction-gögnum teljist sami atburður / duplicate en ekki tvær nýjar færslur.

**Ekki flytja inn þessar 22 færslur.**

---

# 22. ImportBatch status – aukaatriði sem kom í ljós

Eldri batch #18 sýndi stöðuna:

`IMPORTED:0:DUPLICATES:371`

þótt færslurnar sjálfar séu augljóslega stofnaðar úr `platinum kort 2026.xlsx` nokkrum sekúndum áður en batch-status var uppfærður.

Þetta bendir til að sama preview/confirm hafi mögulega verið staðfest aftur og status textinn hafi þá endað á seinni idempotent keyrslunni: 0 nýjar / 371 duplicates.

Þetta er ekki rót 22-grænu villunnar, en audit/status framsetning innflutnings ætti síðar að verða sterkari svo batch-saga lýsi raunverulegri fyrstu innlestri betur.

---

# 23. Git / vinnuskrár við dagslok

Aðal production Festa commit er komið á main:

`14b99ef` – **Verify document identity locking in PostgreSQL**

Nova/VSK breytingarnar voru enn í vinnusvæði og ekki á að stage-a óskyld diagnostic gögn með þeim.

Sérstaklega þarf áfram að passa að óskyld/untracked diagnostic og dagbókarskjöl fari ekki óvart með í commit.

Viðeigandi Nova/VSK skrár til sértæks future staging eru meðal annars:

- `app/actions/receiptActions.ts`
- `app/vsk/page.tsx`
- `lib/receipts/ingestion.ts`
- `lib/receipts/ingestion-labeled-purchase-lines.test.ts`
- `lib/receipts/recurring-booking.ts`
- `lib/receipts/recurring-booking.test.ts`
- `lib/vat/receipt-selection.ts`
- `lib/vat/receipt-selection.test.ts`

Diagnostic scripts eiga ekki sjálfkrafa með í product commit.

---

# 24. Prófanir og staðfestingar dagsins

Stærstu staðfestingar dagsins:

### Document-instance/Festa
- 68/68 focused tests græn við service/adapter checkpoint;
- Prisma generate hreint;
- TypeScript hreint;
- diff-check hreint;
- PostgreSQL integration: 6/6 græn;
- production deploy Ready á `14b99ef`.

### Nova / deterministic receipt
- 7/7 targeted Nova/labeled invoice/recurring booking tests græn eftir fyrsta fix;
- `tsc --noEmit` hreint;
- `git diff --check` hreint;
- browser/UI smoke sýndi 2 línur í stað 8;
- 189 kr. gjald rétt í stað 1.189;
- 75% VSK skipting kom sjálfkrafa í réttu reconstruction-flowi;
- debet/kredit stemmdi 6.779 kr. þegar credit-lína var sett á 2000.

### Kortainnflutningur
- provenance diagnostic staðfesti gamla source file;
- 22/22 „Tilbúið“ línur reyndust hafa eldri samsvörun;
- 22/22: eini munur = 1 ms timestamp.

---

# 25. Hvað á EKKI að gera næst

- Ekki segja Festa fullklárað enn.
- Ekki import-a 22 grænu Platinum-færslurnar.
- Ekki handleiðrétta 1 kr. Jan–Feb VSK roundingu án underlying evidence.
- Ekki hardkóða Nova eða Platinum sérlausnir þar sem almenn canonical/deterministic regla dugar.
- Ekki stage-a diagnostics eða óskyld skjöl með Nova/VSK product commit.
- Ekki byrja aftur á Sala nema vísvitandi sé farið inn í `C:\GLÖGGT-SALA`.

---

# 26. Fyrstu verk næstu lotu

## A. Kortainnflutningur – líklegasti fyrsti litli fix

1. finna fingerprint helper fyrir `PaymentCardTransaction`;
2. normalisera timestamp á deterministic/stable precision áður en hash er búið til;
3. bæta við regression-test fyrir `.999` vs `.000` 1 ms boundary;
4. keyra preview aftur á sömu skrá;
5. vænt niðurstaða: **120 þegar innflutt / 0 til innflutnings** ef enginn annar munur er til.

## B. Nova/VSK UI frágangur

1. sýnilegt pending/success/error á `Endurbyggja tillögu úr staðfestum gögnum`;
2. koma í veg fyrir stale/rangt UI flash;
3. vista VSK-reason/skýringu eðlilega með workflowinu;
4. keyra targeted tests + tsc + diff-check;
5. sértækt commit-a aðeins Nova/VSK skrár.

## C. VSK tölur

1. staðfesta júlí–ágúst eftir að bæði Nova-skjöl eru endanlega bókuð;
2. rannsaka 1 kr. Jan–Feb rounding discrepancy;
3. bera Mar–Apr við það sem var áður skilað;
4. staðfesta hvort Maí–Jún þarf +292 kr. viðbótarleiðréttingu.

## D. Festa

Þegar farið er aftur í Festa:

1. duplicate candidate reevaluation;
2. production wiring;
3. lock á duplicate-relevant writers;
4. atomic reevaluation;
5. raunverulegt Festa acceptance-test.

---

# 27. Dagsniðurstaða

2. október var dagur þar sem GLÖGGT varð marktækt öruggara á þremur ólíkum en skyldum sviðum.

Í document-instance/Festa vinnunni færðist kerfið frá pure reglum yfir í **raunverulega production-staðfesta, tenant-scoped, evidence-backed og concurrency-safe identity-vél** með PostgreSQL advisory locking.

Í VSK/Fylgiskjölum kom í ljós að mikilvægar bókaðar færslur gátu dottið út vegna rangrar parent-status síu. Sú villa var ekki falin með handvirkum tölum heldur rakin niður í selection-lagið og lagfærð almennt.

Í Nova-vinnunni var deterministic línulestur styrktur þannig að prentaðar línur ráða, exact reconciliation verður að standast og recurring booking getur nýtt reviewed history án þess að company-specific reikningar leki milli fyrirtækja.

Og í lok dags fannst mjög dæmigert „smátt tölugildi, stór áhrif“ vandamál í kortainnflutningi: **1 millisekúnda í Excel-dagsetningu breytti fingerprinti og gerði 22 eldri færslur að fölskum nýjum færslum.** Nú er það sannað, afmarkað og tilbúið í hreina deterministic lagfæringu.

Það er góður dagslokapunktur vegna þess að ekkert þarf að giska á næst. Næsta lota byrjar á mjög skýrum, litlum verkefnum með sannprófanlegri væntri niðurstöðu.

---

**Production Festa checkpoint:** `14b99ef` – Ready  
**Festa staða:** undirliggjandi vél sönnuð, production workflow ekki enn end-to-end lokað  
**Nova/VSK staða:** meginfix virkar í UI, enn ócommit-aður frágangur og nokkur UI-atriði eftir  
**Kortainnflutningur:** 22/22 grænar línur staðfestar false-new vegna 1 ms timestamp-munar  
**Sala:** `C:\GLÖGGT-SALA` / `feature/sala-v1` ósnert allan daginn  
**Næsti öruggi byrjunarpunktur:** timestamp-normalisering í kortafingerprint + regression-test
