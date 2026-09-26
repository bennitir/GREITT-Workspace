# Hvernig GLÖGGT lærir af yfirferð bókara

GLÖGGT á að læra af daglegri vinnu bókara. Bókari á ekki að þurfa að biðja forritara um nýja sérreglu fyrir hverja nýja vöru eða reikning.

## Þrjú aðskilin lög

### 1. Hvað er varan?

Sameiginleg GLÖGGT-þekking lýsir vörunni sjálfri, óháð bókhaldslykli.

Dæmi:

- Monster getur verið **neysluvara / drykkjarvara**.
- Kleina getur verið **neysluvara / matarvara**.

Þessi þekking segir ekki að varan eigi alltaf að fara á ákveðinn reikningslykil.

### 2. Hvert er samhengi viðskiptanna?

Sama vara getur haft mismunandi hlutverk eftir fyrirtæki og viðskiptum.

Dæmi: Monster getur verið:

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

Blandaðar kvittanir mega ekki læra eina almenna reglu á borð við „Olís = 4750“ eða „Olís = 4910“ þegar sama kvittun inniheldur fleiri en einn kostnaðarflokk.

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

- Olís-kvittun inniheldur `Barebells Cinnamon bun`, `Barebells Strawberry sundae` og `Monster Zero Ultra White`.
- Bókari staðfestir allan kostnað skjalsins á `4910`.
- Næst þegar sama vara kemur getur GLÖGGT notað fyrirtækjasértæka vöru→reikningsþekkingu áður en söluaðilaregla eða AI kemur til greina.

Þetta gildir **ekki** ef kvittunin er skipt á fleiri en einn kostnaðarreikning. Þá þarf tenging einstakrar vörulínu við reikning áfram að vera ótvíræð, t.d. með vöruheiti eða sömu línufjárhæð.

Verð, magn, afslættir og VSK eru alltaf lesin af nýja skjalinu. GLÖGGT lærir ekki gamla fjárhæð sem nýja fjárhæð.
