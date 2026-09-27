# Hvernig GLÖGGT lærir af yfirferð bókara

GLÖGGT á að læra af daglegri vinnu bókara. Bókari á ekki að þurfa að biðja forritara um nýja sérreglu fyrir hverja nýja vöru eða reikning.

## Þrjú aðskilin lög

### 1. Hvað er varan?

Sameiginleg GLÖGGT-þekking lýsir vörunni sjálfri, óháð bókhaldslykli.

Dæmi:

- Vörulína getur verið **neysluvara / drykkjarvara**.
- Kleina getur verið **neysluvara / matarvara**.

Þessi þekking segir ekki að varan eigi alltaf að fara á ákveðinn reikningslykil.

### 2. Hvert er samhengi viðskiptanna?

Sama vara getur haft mismunandi hlutverk eftir fyrirtæki og viðskiptum.

Dæmi: sama vara getur verið:

- veitinga- eða starfsmannakostnaður hjá einu fyrirtæki,
- vörukaup til endursölu hjá söluturni,
- birgðavara hjá veitingastað.

### 3. Hvernig bókar þetta fyrirtæki samhengi sitt?

Reikningslykill er fyrirtækjasértækur.

Ef eitt fyrirtæki bókar staðfest veitingasamhengi á `4910`, þýðir það ekki að `4910` eigi við hjá öðrum fyrirtækjum.

## Hvað gerist þegar bókari leiðréttir?

Þegar bókari yfirfer skjal og staðfestir rétta bókun getur GLÖGGT varðveitt:

- almenna vöruþekkingu sem má nýtast víðar,
- fyrirtækjasértækt samhengi og reikningsval,
- sönnun um hvaða yfirferð styrkti mynstrið.

Leiðréttingin sjálf er kennslan; sérstakt „kenna kerfinu“ skref á almennt ekki að vera nauðsynlegt.

## Hvenær má þekking nýtast öðrum fyrirtækjum?

Ný almenn vöruþekking byrjar varfærnislega sem **candidate**.

- Sama fyrirtæki má endurnýta eigin staðfestingu strax sem tillögu.
- Þekking verður sameiginleg fyrir önnur fyrirtæki þegar nægar sjálfstæðar staðfestingar styðja sömu almennu merkingu.
- Ef staðfestingar stangast á fer þekkingin í ágreiningsstöðu í stað þess að GLÖGGT velji hlið sjálfkrafa.

Fyrirtækjasértækir reikningslyklar, kortaendingar, fjárhæðir og viðskiptasaga eru ekki gerð að sameiginlegri reglu.

## Gögn fyrst, AI síðan

GLÖGGT reynir fyrst að nota:

1. texta og vörulínur frumskjals,
2. canonical vöru-/entity-þekkingu,
3. staðfesta sögu fyrirtækisins,
4. deterministic pörun og reglur.

AI á aðeins að koma inn þegar raunveruleg óvissa stendur eftir og AI getur bætt niðurstöðuna.

## Línusértækur lærdómur á blönduðum kvittunum

Blandaðar kvittanir mega ekki læra eina almenna reglu á borð við „Söluaðili = einn fastur reikningur“ þegar sama kvittun inniheldur fleiri en einn kostnaðarflokk.

GLÖGGT tengir þess í stað staðfesta bókun við vörulínuna sjálfa þegar tengingin er ótvíræð, til dæmis þegar:

- bókunartexti bókara samsvarar vöruheitinu á kvittuninni, eða
- fjárhæð einnar bókunarlínu samsvarar nákvæmlega einni vörulínu.

Dæmi:

- `Rúðuþvottur` sem bókari staðfestir á `4750` verður fyrirtækjasértækt vöru→reikningsmynstur.
- `Rúðuþurkur` sem bókari staðfestir á öðrum reikningi lærir sitt eigið mynstur.
- Veitingalínur mega áfram nota almenna vöru-/samhengisþekkingu, en ekki er gert ráð fyrir að allt frá sama söluaðila eigi á sama lykil.

Eldri yfirfarin bókun getur einnig nýst sem tillaga ef bókarinn hefur notað sjálft vöruheitið sem bókunartexta. Ef eldri staðfestingar benda á fleiri en einn reikning fyrir sama vöruheiti skal GLÖGGT ekki giska.

### Endurteknar vörur á einsleitum kvittunum

Ef bókari staðfestir skjal þar sem **allur kostnaðurinn fer á einn kostnaðarreikning**, má GLÖGGT læra að raunverulegar vörulínur skjalsins tilheyri þeim reikningi hjá þessu fyrirtæki.

Dæmi:

- Kvittun inniheldur þrjár endurteknar vörur sem hafa áður verið staðfestar.
- Bókari staðfestir allan kostnað skjalsins á einn kostnaðarreikning.
- Næst þegar sama vara kemur getur GLÖGGT notað fyrirtækjasértæka vöru→reikningsþekkingu áður en söluaðilaregla eða AI kemur til greina.

Þetta gildir **ekki** ef kvittunin er skipt á fleiri en einn kostnaðarreikning. Þá þarf tenging einstakrar vörulínu við reikning áfram að vera ótvíræð, t.d. með vöruheiti eða sömu línufjárhæð.

Verð, magn, afslættir og VSK eru alltaf lesin af nýja skjalinu. GLÖGGT lærir ekki gamla fjárhæð sem nýja fjárhæð.

## Eldri staðfestar kvittanir nýtast án sérstakrar endurvinnslu

GLÖGGT þarf ekki að bíða eftir nýjum staðfestingum til að nýta eldri yfirfarin skjöl þegar gögnin eru nægilega skýr.

Ef eldra skjal:

- hefur canonical vörulínur,
- var yfirfarið,
- og allur kostnaður skjalsins var staðfestur á **einn kostnaðarreikning**,

má GLÖGGT nota það strax sem fyrirtækjasértæka vísbendingu fyrir sömu vöru í nýju skjali. Þetta er lesið úr staðfestri sögu þegar ný tillaga er byggð og krefst ekki sérstakrar gagnagrunnsmigrationar.

Ef eldri skjöl benda á fleiri en einn reikningslykil fyrir sömu vöru skal GLÖGGT ekki giska.

### Hausar og afgreiðsluupplýsingar eru ekki vörur

Línur eins og `Nr. viðskipta`, `Viðskiptamaður`, `Kenni starfsmanns`, `Kassi nr.`, dagsetning, verslun og greiðsluupplýsingar eru metadata kvittunarinnar. Þær mega hvorki verða vörulínur né læranleg vöruheiti, jafnvel þótt OCR/PDF-textalag setji tölu aftast í sömu línu.


### Afbrigði vöruheita og eldri síður í sama safnskjali

Sama vara getur birst örlítið öðruvísi í PDF-textalagi án þess að varan sjálf hafi breyst. Dæmi:

- `Vörumerki Zero 500ml`
- `Vörumerki Zero`
- sama heiti með einni augljósri OCR-stafavillu

GLÖGGT má para slík afbrigði aðeins þegar vörulykillinn er nógu sértækur. Stranga reglan er að a.m.k. þrjú merkingarbær orð þurfa að passa og nær allt styttra heitið þarf að finnast í hinu. Stutt eða almenn tveggja orða heiti fá ekki fuzzy pörun.

Stærð, magn, verð, afsláttur og VSK eru áfram lesin af nýja skjalinu og taka engan þátt í vöruauðkenninu.

### POS-dálkar mega ekki menga vöruheitið

Í POS/PDF-kvittunum þar sem ein vörulína inniheldur `Vörunr.`, vöruheiti, einingarverð, magn, afslátt, nettó, VSK og samtölu á sömu textalínu les GLÖGGT töludálkana sér. Dæmi:

- `120211 Vörumerki Zero 500ml 479,00 2 220,00 661,46 73,14 738,00`

verður canonical vörulína með heitinu `Vörumerki Zero 500ml`, magni `2` og línusamtölu `738`, en verð-/VSK-dálkarnir verða ekki hluti af vöruauðkenninu. Þetta er mikilvægt svo endurtekin vara passi við eldri staðfesta sögu án þess að gamalt verð sé endurnýtt.

PDF-textalag getur líka brotið sömu vöruröð í fleiri textalínur, t.d. vörunúmer og heiti á einni línu en stærð/töludálka á næstu. Deterministic parserinn má sameina slíkar framhaldslínur þegar næsta lína er ekki sjálfstæð vöruröð. Hann má aldrei sameina yfir í næstu vöru.

Ef eldri **yfirfarin síða í sama PDF-safnskjali** var staðfest áður en canonical `purchaseLines` voru geymdar, má GLÖGGT við deterministic endurbyggingu lesa vörulínurnar aftur úr sömu upprunalegu PDF-síðu án AI. Vörulínurnar eru þá cache-aðar í metadata og geta orðið staðfest söguleg vísbending. Frum-PDF-ið sjálft er óbreytt.

## Greining deterministic endurbyggingar

Í þróunarham má GLÖGGT sýna tímabundna greiningu eftir „Endurbyggja tillögu úr staðfestum gögnum“. Hún á að hjálpa við að staðsetja villu í almenna flæðinu án sérkóðunar fyrir fyrirtæki, seljanda eða vöru.

Greiningin sýnir m.a.:

- hversu margar canonical vörulínur parserinn fann,
- magn og línusamtölu hverrar línu,
- hvort staðfest product-pattern eða yfirfarin bókunarsaga fannst,
- hvort sögulegar tengingar eru ósamræmdar,
- og hvaða reikningur var valinn þegar tengingin var örugg.

Ef vara vantar alveg úr þessum lista er vandinn í línugreiningu/parsing áður en product-matching byrjar. Ef varan birtist en hefur enga örugga reikningstengingu er vandinn í staðfestri sögu eða pörun. Þessi greining kallar ekki á AI og breytir ekki frumskjalinu.

## Endurlestur eldri vörulína

Deterministic POS-línugreining er útgáfustýrð. Þegar línugreining batnar má GLÖGGT, við skýra endurbyggingaraðgerð notanda, endurlesa eldri yfirfarin undirskjöl úr sama varðveitta frumskjali án AI. Þannig geta eldri staðfestar bókanir orðið örugg fyrirtækjasértæk vörusaga án þess að sérkóða birgja, fyrirtæki eða vörumerki. Greiðsluhausar, samtölur og footer-texti teljast ekki vörulínur.

