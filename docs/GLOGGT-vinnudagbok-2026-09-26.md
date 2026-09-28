# GLÖGGT – vinnudagbók 26. september 2026

## Dagurinn í einni setningu

**Við tókum yfirferð fylgiskjala úr hægu „opna–zooma–loka–fara til baka“ ferli yfir í lifandi vinnuborð þar sem frumskjal, staðfest saga, bókun og mannleg leiðrétting vinna saman — og dagurinn endaði á mjög skýrri áminningu um að frumritið verður alltaf að vinna gegn rangri AI-lesningu.**

---

## Af hverju þessi dagur byrjaði

Upphaflega vandamálið var einfalt og mjög mannlegt:

> upplýsingarnar sem fylgdu fylgiskjalinu voru of litlar; hvert blað þurfti að opna, zooma og skoða sérstaklega; yfirferðin varð of seinleg.

Þetta varð að hönnunarspurningu sem skipti meira máli en nokkur einstakur hnappur:

**Hvernig getum við látið bókara halda augunum og höndunum í sama vinnusamhengi meðan hann yfirfer mörg skjöl í röð?**

Svarið í dag varð ekki eitt stórt „feature“, heldur mörg lítil lög sem fóru að vinna saman.

---

## 1. Frumskjalið færðist inn í vinnuna

Við vildum hætta að láta frumskjalið vera eitthvað sem þarf að „fara út í“.

Ný yfirferðarsýn þróaðist yfir í:

- frumskjal vinstra megin;
- bókun og greining hægra megin;
- fljótandi `Yfirferðargögn` spjald ofan á frumskjal;
- söluaðila, dagsetningu, upphæð, reikningsnúmer og bókun sýnileg við skjalið sjálft;
- spjaldið draganlegt svo það hylji ekki það sem þarf að lesa;
- minni rammi utan um frumskjal svo meira pláss nýtist í sjálfa vinnuna.

Þetta var fyrsta stóra UX-niðurstaða dagsins: **bókarinn á ekki að elta skjalið um kerfið; skjalið á að vera við bókunina.**

---

## 2. Zoom/pan varð raunverulegt tækniverkefni

Það sem virtist fyrst vera „bara setja + og − takka“ reyndist vera klassískt browser/PDF-vandamál.

Við sáum í raunprófum:

- zoom-hnappur hvarf við breytingu;
- þegar hann kom aftur tapaðist pan;
- prósentutala fór í 225%, 275%, 325% án þess að PDF yrði raunverulega stærra;
- CSS-zoom stækkaði pixla frekar en skjalið og textinn fór úr fókus;
- skjalið gat stokkið aftur í frumstöðu eftir örfáar sekúndur;
- signed URL endurnýjun og remount fóru að endurstilla vinnusýnina.

Við færðum PDF-yfirferðina því yfir í canvas/PDF.js nálgun þar sem:

- PDF-síðan er renderuð í nýrri upplausn við hvert zoom;
- 100% þýðir „Passa“;
- +/− endurteiknar skjalið;
- músin flytur skjalið inni í viewport;
- zoom/pan er bundið við stöðugt skjal/síðu-auðkenni og á ekki að týnast við venjulega signed URL endurnýjun.

Þetta var gott dæmi um daginn: **við hættum að fela browser-vandann með CSS og löguðum raunverulega rendering-keðjuna.**

---

## 3. Ljósmyndin má snyrtast — en frumritið er heilagt

Þegar ljósmyndir af kvittunum komu upp varð annað raunverulegt rekstraratriði sýnilegt: svart borð, borðplata eða umhverfi utan reiknings kostar blek og tekur pláss.

Við prófuðum sjálfvirka snyrtingu/crop á vinnusýn.

KFC-prófið leit vel út, en Bílanaust sýndi líka hættuna: crop má ekki vera svo „snjallt“ að það byrji að klippa af neðri hluta raunverulegs reiknings.

Reglan sem stendur eftir er:

> **Frumritið er óbreytt. Vinnusýn má hjálpa, en hún má frekar skilja eftir of mikið en skera af sönnunargögnum.**

Þessi regla gildir bæði fyrir skjásýn og prentútgáfu.

---

## 4. Product-learning fór úr hugmynd yfir í raunpróf

Olís-skjölin urðu frábær prófun á hugmyndinni „gögn fyrst, AI síðan“.

Við sáum bókunartillögu þar sem haus-/metadata reitir eins og:

- `Nr. viðskipta`
- `Kenni starfsmanns`

voru ranglega orðnir bókunarlínur með tölum sem litu út eins og fjárhæðir.

Fyrsta niðurstaða:

**metadata-línur mega aldrei verða vörulínur eða product learning.**

Síðan kom ný aðgerð:

### Endurbyggja tillögu úr staðfestum gögnum

Hún á að:

- eyða aðeins óstaðfestri tillögu;
- lesa canonical vörulínur;
- nota fyrri staðfesta bókunarsögu fyrirtækisins;
- varðveita greiðsluupplýsingar sem eru öruggar;
- kalla ekki í AI;
- og giska ekki ef saga er ósamræmd.

---

## 5. Diagnostic-kassinn breytti hvernig við debuggum

Þegar Monster kom ekki inn í tillöguna vorum við við það að bæta við fleiri matching-reglum.

Þá kom mikilvægt stopp:

> ekki giska meira — sjáum fyrst hvar línan dettur út.

Við settum inn `Greining endurbyggingar`.

Hún sýndi:

- `Monster Zero Ultra White 500ml` — magn 2 — 738 kr. — parser fann línuna;
- `Barebells Strawberry sundae` — 550 kr. — fann fyrri sögu á 4910;
- `Greiðslur` og `greidd` voru líka að leka inn sem „vörur“.

Þá varð ljóst að parserinn var ekki vandamálið fyrir Monster. Vandinn var history lookup.

Það var miklu betri staða en „þetta virkar ekki“.

---

## 6. Almenn regla vann — ekki sérkóði fyrir Sturlu

Á miðri leið kom mjög mikilvæg spurning:

> „ertu þá farin að sér skrifa fyrir stulla“

Það var rétt athugasemd.

Sturla má vera raunverulegt testcase og hans staðfesta bókunarsaga má auðvitað vera hans fyrirtækisgögn. En kóðinn má ekki verða `if Sturla`, `if Olís`, `if Monster`.

Því var næsta lausn gerð almenn:

- parser versioning;
- eldri staðfest systurskjöl geta endurlesist deterministic;
- allar yfirfarnar systursíður í sama safnskjali komast í history lookup;
- payment/footer línur eru síaðar almennt;
- normalized product matching er almennt.

Og testcase-ið tókst:

- Monster 738 → 4910;
- Barebells 550 → 4910;
- VISA 6127 → 2230;
- 1.288 = 1.288.

Þetta var líklega fallegasta „gögn fyrst“ augnablik dagsins: **sama kerfið sem hafði áður rangt lesið hauslínur gat nú endurbyggt rétta bókun úr staðfestri sögu án AI.**

---

## 7. Setja til hliðar — bókarinn þarf að geta haldið rennslinu

Sum skjöl þurfa nánari rannsókn. Þau mega ekki blokkera allan bunka.

Við settum inn:

- `Þarf skoðun – setja til hliðar`;
- sérlista fyrir skjöl sem bíða nánari skoðunar;
- `Setja aftur í yfirferð`.

Fyrsta próf fann strax galla: skjalið fór til hliðar en kom aftur sem næsta skjal.

Það sýndi að „status“ ein og sér dugar ekki — **queue logic þarf að virða statusinn**.

Næsta-leitin var því lagfærð svo `needsAttentionAt` skjöl detti úr venjulegri yfirferðarröð.

Þetta er lítið UI-atriði sem hefur stór áhrif á vinnuflæði: bókarinn þarf að geta sagt „ekki núna“ án þess að kerfið svari „allt í lagi — hér er það aftur strax“.

---

## 8. Heilsueflingarstyrkur varð að almennri uppgjörsreglu

Ungmennafélag Njarðvíkur skjalið varð góð hönnunarspurning:

- við sjáum um bókhaldið;
- annar aðili sér um launamiða/framtal;
- samt þarf bókhaldið að varðveita upplýsingar sem sá aðili þarf síðar.

Niðurstaðan var:

### 4520 – Starfsmannastyrkir og endurgreiðslur

Einn almennur lykill, en tegundin á að lifa sér í gögnum:

- heilsuefling;
- aksturs-/bílastyrkur;
- nám;
- annað.

Með færslunni á síðar að geta varðveist:

- starfsmaður;
- tegund;
- fjárhæð;
- frumskjal;
- uppgjörsmerking.

GLÖGGT á að gera þetta sýnilegt þeim sem sér um ársuppgjör, en ekki þykjast vinna framtalið ef þjónustan nær ekki þangað.

Þetta er gott dæmi um gamla GLÖGGT-reglu:

> **staðreynd núna, uppgjörsatriði síðar.**

---

## 9. Eldri greining má ekki neyða fram nýtt AI-kall

Sama heilsueflingarskjal var líka legacy-skjal sem hafði verið lesið áður en umhverfisstaðfesting var aðskilin frá bókunargreiningu.

Gamla UI-ið sagði í raun:

> þú þarft að lesa þetta aftur.

En það var óþarfi. Við vissum þegar hvað skjalið var.

Ný leið varð:

### Nota núverandi gögn og halda áfram

Bókarinn getur:

- valið lykil;
- sett upphæð;
- valið debet/kredit;
- sett texta;
- búið til handvirk drög;
- án AI;
- án þess að GLÖGGT giski á mótreikning.

Þetta varð bæði ódýrara og virðingarmeira við vinnu bókarans: **ekki neyða nýja greiningu þegar maðurinn hefur þegar staðfest staðreyndina.**

---

## 10. Prentun — frá þremur blöðum aftur í eitt raunverulegt fylgiskjal

Prentunin var einn þrjóskasti þráður dagsins.

Við vildum:

- prenta aðeins núverandi detected document;
- halda frumskjalinu heilu;
- setja lítinn bókunarstimpil á sama blað;
- spara tóner;
- halda rennslinu áfram á næsta skjal.

Við sáum í raunprófum:

- browser HTML-print bjó til 3 sheets;
- fyrsta blað var nánast tómt;
- stimpill og frumskjal skiptust á blöð;
- nýr flipi þurfti handvirka lokun;
- `afterprint` gat hlaupið áður en notandi náði að ýta á Print.

Rétta prentleiðin reyndist aftur vera sú sem hafði virkað best áður:

**búa til raunverulegt PDF með overlay/stimpli og prenta það.**

Staðfest:

- print preview sýndi **1 sheet of paper**;
- frumskjal og bókunarstimpill voru á sama blaði.

En UX-reglan varð líka skýr:

> **kerfið má hjálpa við að opna prentun, en það má ekki gleyma að prenta eða hoppa áfram áður en maðurinn er tilbúinn.**

Vafrinn segir ekki örugglega hvort print-dialog endaði í Print eða Cancel. Því má `afterprint` ekki eitt og sér vera heimild til að fara áfram.

---

## 11. Pítan → Subway → Spíran: kvöldið sem minnti okkur á hver ræður

Undir lok dags kom skjal sem í fyrstu virtist einfalt veitingakaup.

GLÖGGT hafði lesið:

- Pítan;
- 4.890 kr.

En þegar frumritið var skoðað betur passaði það ekki.

Notandi leitaði að réttu frumriti og spurði hvort tölurnar væru í raun bornar saman. Það var rétt gagnrýni.

Skjalið var síðan lesið aftur með AI.

Ný niðurstaða:

- Subway Álfabakka;
- 7.930 kr.

Sama frumrit.

Þegar frumritið var snúið og lesið af manni kom sannleikurinn í ljós:

- **Spíran**;
- **Álfabakki 6**;
- **VISA 6127**;
- **7.6.2026 kl. 10:55**;
- **11.780 kr.**

Þetta var mjög sterkt testcase.

AI hafði ekki bara misst staf eða lesið eina tölu rangt. Það gaf **tvær ósamræmdar sögur um sama frumrit**.

Það leiddi til tveggja beinna UX-bóta:

1. `↺ / ↻` til að snúa frumskjali í vinnusýn;
2. `Breyta` við söluaðila svo bókarinn geti staðfest rétt nafn beint við frumskjalið.

Notandi leiðrétti síðan:

- söluaðila → Spíran Álfabakka 6;
- upphæð → 11.780;
- bókun → 4910 / 2230 VISA 6127;
- bókun stemmdi.

Þetta er ein sterkasta hönnunarniðurstaða dagsins:

> **AI má aldrei fá síðasta orðið bara af því að það svaraði. Frumrit + staðfest mannleg yfirferð eru authoritative.**

Og þegar sama frumrit fær mismunandi AI-niðurstöðu ætti GLÖGGT síðar að geta sagt sjálft:

> „Greiningar stangast á — þarfnast staðfestingar.“

---

## 12. Git-checkpoint sem bjargaði deginum frá því að verða of stór

Þegar mikið hafði verið smíðað án push var réttilega stoppað og tekinn checkpoint.

Fyrir commit:

- Prisma migrations applied;
- TypeScript hreint;
- staged diff check hreint;
- nákvæmar skrár staged;
- ekki `git add .`.

Commit:

`d002e9e Improve receipt review workflow and product learning`

Tölur:

- 27 files changed;
- 5.692 insertions;
- 184 deletions.

Push:

- `main -> main`;
- `origin/main = d002e9e`.

Vercel:

- Ready;
- Production;
- um 1m39s build.

Þessi checkpoint skiptir miklu máli því seinni hluti dagsins hélt áfram með marga staðbundna patcha. Ef eitthvað fer úrskeiðis er `d002e9e` öruggur punktur.

---

## Hvað er staðfest í lok dags

- `d002e9e` er í GitHub og Vercel Production Ready.
- Fylgiskjalaviewer með frumskjali + Yfirferðargögnum er raunprófaður.
- Zoom/pan á PDF er kominn yfir í raunverulega canvas-stækkun.
- Stöðugleiki zoom/pan gegn bakgrunnsrefresh var bættur.
- Varfærin crop/snyrting ljósmynda er til staðar.
- Deterministic endurbygging án AI er raunprófuð.
- Product-history testcase Monster + Barebells stemmdi 1.288 / 1.288.
- Diagnostic endurbyggingar fann nákvæmlega parsing vs history vandann.
- 4520 starfsmannastyrkir og endurgreiðslur var hannaður og prófaður í handvirku flæði.
- Legacy skjal fékk leið án skyldu-AI-endurlesturs.
- One-sheet print PDF með bókunarstimpil var staðfest í print-preview.
- Snúningur frumskjals og leiðrétting söluaðila voru staðfest sjónrænt.
- Spíran-skjalið var handvirkt leiðrétt í 11.780 kr. og bókun stemmdi.

---

## Hvað er EKKI enn fullstaðfest / production

Margar breytingar eftir `d002e9e` eru enn í staðbundnum vinnupökkum og þarf að taka sem sérstakan checkpoint.

Sérstaklega:

- nýjasta queue-hegðun fyrir `Þarf skoðun`;
- nýjasta print → next flæði;
- lokahegðun sem tryggir að prentun gleymist ekki;
- 4520 grunnlykill + tengd almenna gagnahugsun;
- legacy „nota núverandi gögn“ leið;
- merchant correction + rotation;
- latest history refresh/footer filter og diagnostic breytingar;
- AI inconsistency guard er aðeins hönnunarniðurstaða, ekki fullsmíðuð regla.

Þetta má ekki merkja production fyrr en tsc, staging, commit/push og smoke-test eru gerð.

---

## Git-reglan stendur enn sterkari eftir daginn

Repoið er enn með unrelated deletions, gamla copy-skrár, `_inspect-*`, `_legacy-*`, generated og fleira.

Því:

**ALDREI `git add .`**

Næsti checkpoint á að byrja á:

```powershell
cd C:\GLÖGGT
git status --short
npx tsc --noEmit
```

Síðan stage-a nákvæmar skrár, `git diff --cached --check`, `name-status`, `stat`, commit og push.

---

## Næsti morgunpunktur

1. Ekki reyna að „bæta“ Spíran með nýju AI-kalli. Rétt frumrit er þegar staðfest.
2. Refresh-a Spíran-skjalið og staðfesta að:
   - söluaðili = Spíran Álfabakka 6;
   - upphæð = 11.780;
   - VISA 6127;
   - bókun 4910 / 2230 stemmir;
   - audit sýnir merchant correction.
3. Prófa nýjasta print-flæðið frá bókuðu skjali:
   - eitt blað;
   - ekkert auto-next áður en prentun er í höfn;
   - `Prenta` tiltækt aftur ef hætt er við;
   - `Næsta fylgiskjal` fer í næsta raunverulega óunnið skjal.
4. Prófa `Þarf skoðun` með tveimur næstu skjölum og ganga úr skugga um að sett-til-hliðar skjal komi ekki aftur sjálfkrafa.
5. Taka nákvæman Git-checkpoint fyrir breytingar eftir `d002e9e`.
6. Síðan halda áfram yfirferðinni sjálfri — nú með minni núningi en í morgun.

---

## Sálin sem við viljum varðveita

Það er auðvelt í svona löngum þróunardegi að telja bara hnappa, skrár, migrations og commits.

En það sem raunverulega færðist í dag var annað:

Við vorum aftur og aftur minnt á að GLÖGGT verður ekki gott kerfi af því að það „getur lesið skjöl“. Það verður gott kerfi ef það **virðir vinnuna sem maðurinn er að vinna**.

Bókarinn þarf að geta:

- séð;
- fært;
- stækkað;
- snúið;
- leiðrétt;
- sett til hliðar;
- prentað;
- farið áfram;
- og treyst því að kerfið muni það sem þegar hefur verið staðfest.

Þegar AI var rangt í kvöld var lausnin ekki að biðja AI um þriðja svar.

Lausnin var að horfa á frumritið.

Það er líklega besta setningin til að enda þennan dag á:

> **GLÖGGT á að hjálpa okkur að sjá sannleikann í gögnunum — ekki sannfæra okkur um að fyrsta vélræna svarið sé sannleikurinn.**

