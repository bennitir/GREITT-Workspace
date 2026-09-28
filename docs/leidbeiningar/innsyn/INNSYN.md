# Innsýn – skildu reksturinn

Staða: þessi kafli er **lifandi kennslukafli**. Hann lýsir staðfestum grunnhugtökum Innsýnar. Nýja sjónræna Innsýn-sýnin er enn í smíðum og því eru ekki skráðir hnappar eða vinnuferli sem eru ekki komin í production.

## Hvað er Innsýn?

Innsýn er ætlað að hjálpa stjórnanda að skilja hvað er að gerast í rekstrinum.

Bókhald getur verið rétt án þess að auðvelt sé að sjá:

- hvort reksturinn er að batna eða versna,
- hvað hefur breyst,
- hvaða kostnaður skýrir breytingu,
- hvað er framundan,
- hvaða atriði þarfnast nánari skoðunar.

Innsýn á að tengja saman gögnin og gera þau skiljanleg, en hún tekur ekki ákvörðun fyrir stjórnandann.

## Gögn fyrst, AI síðan

GLÖGGT notar fyrst þau gögn sem þegar eru til og hægt er að rekja:

- bókanir og fylgiskjöl,
- bankafærslur,
- greiðslukortayfirlit,
- þekktar skuldbindingar og fjárhagsatburði,
- staðfestar tengingar og söguleg mynstur.

AI á aðeins að hjálpa við túlkun eða skýringu þegar deterministic gögn duga ekki ein og sér.

## Bókað, þekkt og bíður staðfestingar

Þetta eru þrjú ólík hugtök:

### Bókað

Fjárhæð eða staðreynd sem er staðfest í bókhaldinu.

### Þekkt

GLÖGGT hefur gögn sem styðja staðreyndina, til dæmis úr bankayfirliti, VISA-yfirliti, samningi eða fylgiskjali, en hún þarf ekki að vera bókuð.

### Bíður staðfestingar

GLÖGGT hefur vísbendingu eða þekkta tengingu sem þarf staðfestingu áður en hún má líta út eins og endanleg bókhaldsstaðreynd.

Innsýn á ekki að láta þessi þrjú lög líta út eins og þau séu það sama.

## Hvaðan kemur niðurstaðan?

Meginreglan er að hægt eigi að rekja greiningu aftur í gögnin sem mynda hana.

Þegar nýja Innsýn-sýnin er komin í notkun verður leiðin almennt:

`heildarmynd → sundurliðun → færslur → fylgiskjal/bankafærsla/kortafærsla → frumgagn`

Þannig á stjórnandi að geta séð bæði niðurstöðuna og hvers vegna GLÖGGT sýnir hana.

## Tímabil

Innsýn er ekki bundin við eitt fast ár.

Hönnunin gerir ráð fyrir samanburði á meðal annars:

- þessum mánuði,
- síðasta mánuði,
- ársfjórðungi,
- heilu ári,
- fyrra ári,
- síðustu 12 mánuðum,
- sérvöldu frá–til tímabili.

Nákvæm ný tímabilsstýring verður skráð hér þegar hún kemur í production.

## Greiðslukort og VISA

GLÖGGT getur varðveitt greiðslukortafærslur sem sjálfstæð gögn.

Markmiðið með tengingu þeirra við Innsýn er meðal annars að geta greint:

- hvaða kortafærslur hafa fundið fylgiskjal,
- hvaða færslur bíða afstemmingar,
- hvort sama greiðsla sé þegar komin inn,
- hvaða kostnaður myndast eftir tímabilum og seljendum.

Líkleg pörun er ekki sjálfkrafa bókun. Tengingin þarf að virða staðfestingarstöðu.

## Þegar tala virðist skrýtin

Ekki líta aðeins á stóru töluna.

Skoðaðu:

1. hvaða tímabil hún nær yfir,
2. hvort hún er **Bókuð**, **Þekkt** eða **Bíður staðfestingar**,
3. hvaða færslur mynda hana,
4. hvort hún er nettóáhrif eða brúttóhreyfing,
5. hvort gögn vanti fyrir tímabilið.

Innsýn á að hjálpa við þetta drill-down fremur en að fela útreikninginn.

## Hvernig GLÖGGT myndar fyrstu samantektina

Nýja Innsýn er byggð þannig að fyrsta stjórnendasýn þarf ekki að lesa alla gagnasöguna í hvert sinn. Kerfið afmarkar gögn við valið tímabil og samanburðartímabil og reiknar síðan samantekt úr staðfestum upprunum.

Í fyrsta gagnalaginu eru þrjár meginuppsprettur:

- bókaðar færslur,
- bankafærslur,
- greiðslukortafærslur.

Þetta er tæknilegur grunnur að nýju sjónrænu sýninni; nýja Blönduðu sýnin er ekki komin í production fyrr en hún hefur verið tengd og prófuð sérstaklega.

### Af hverju skjal og frumskjal eru ekki alltaf það sama

Eitt PDF-frumskjal getur innihaldið fleiri en eitt bókhaldsskjal. Innsýn þarf því að halda hverri bókaðri einingu aðskildri með sinni dagsetningu, mótaðila og bókun. Það gerir sundurliðun og framtíðar-drill-down áreiðanlegri.

## Prófunarsýn: ný Blönduð Innsýn

Ný stjórnendasýn er byggð samhliða núverandi Innsýn undir leiðinni:

`/innsyn/ny`

Hún er fyrst notuð til sannprófunar áður en hún tekur yfir aðalsíðuna. Núverandi `/innsyn` helst því aðgengileg sem djúpgreining á meðan samanburður fer fram.

Í prófunarsýninni má velja:

- síðustu 12 mánuði,
- þetta ár,
- þennan ársfjórðung,
- þennan mánuð.

Sýnin byrjar á **Svona stendur reksturinn**. Textinn þar er ekki frjáls AI-samantekt; hann er valinn úr deterministic niðurstöðum, til dæmis bókaðri niðurstöðu, breytingu tekna/gjalda og óafstemmdum banka- eða kortafærslum.

Þróunargrafið sýnir sömu bókuðu gögnin eftir mánuðum:

- tekjur,
- rekstrargjöld,
- niðurstöðu.

Undir því má sjá stærstu gjaldalykla og stærstu mótaðila eftir bókuðum rekstrarkostnaði.

### Hvernig á að lesa banka- og kortasvæðið

Bankafærslur og VISA/kortafærslur eru sýndar sér frá bókhaldinu. Þær geta því gefið Innsýn upplýsingar um raunverulegt peningaflæði og hvað bíður afstemmingar, en þær verða **ekki sjálfkrafa bókaðar staðreyndir**.

Ef sýnt er t.d. að 10 kortafærslur bíði afstemmingar merkir það að GLÖGGT veit um færslurnar en tenging þeirra við fylgiskjöl/bókun hefur ekki verið staðfest.

### Tímabil og samanburður

`Þessi mánuður`, `Þessi ársfjórðungur` og `Þetta ár` miðast við stöðuna **til dagsins í dag**. Þannig eru framtíðardagar án gagna ekki túlkaðir sem lækkun. Þegar sambærileg bókuð gögn eru til er sýnt hvernig tekjur og gjöld hafa breyst frá fyrra sambærilega tímabili.

### Staða prófunarsýnar

Blönduð sýn er fyrsti UI-áfanginn. `Myndræn`, `Tölur` og `Skýring` eiga síðar að sýna **sömu niðurstöður úr sömu sannleikslínu**, ekki reikna nýja útgáfu af sannleikanum hver fyrir sig.


### Þegar gögn vantar á þróunargrafi

Þróunargrafið heldur ekki áfram í núll eftir síðustu bókuðu færslu. Það byrjar við fyrstu raunverulegu bókuðu færslurnar og endar við þær síðustu á völdu tímabili. Ef gögn vantar inni á milli tímabila birtist rof í línunni í stað þess að GLÖGGT gefi sér að gildið sé 0.

### Bókað og rekstrarþróun eru ekki sama línan

Mánaðarlegar bókanir geta sveiflast mikið þegar reikningar eru gefnir út á óreglulegum dagsetningum. Það getur til dæmis látið einn mánuð líta út fyrir að vera tekjulausan þótt reksturinn hafi haldið áfram eðlilega.

Prófunarsýnin varðveitir því tvö lög:

- **Bókað** sýnir raunverulega bókun eftir dagsetningu og er óbreytt bókhaldsstaðreynd.
- **Rekstrarþróun (3 mán.)** er stjórnendaleg trendlína sem notar 3 mánaða hlaupandi meðaltal af bókaðri niðurstöðu.

Trendlínan færir ekki tekjur eða gjöld milli mánaða og breytir ekki bókhaldinu. Hún er aðeins hjálpartæki til að sjá undirliggjandi þróun þegar dagsetning reikninga veldur tímabundnum sveiflum.

Ef gögn vantar inni í þriggja mánaða glugganum er trendlínan ekki reiknuð yfir gatið. GLÖGGT gefur sér því ekki gildi þar sem gögn vantar.

## Kafa dýpra í gjöld og mótaðila

Í prófunarsýninni má nú velja línu undir **Hvert fara peningarnir?** eða **Stærstu mótaðilar** og opna rekjanlega sundurliðun.

Sundurliðunin sýnir sama bókaða sannleikann á fleiri stigum:

- heildarupphæð valins gjaldalykils eða mótaðila,
- þróun eftir mánuðum,
- hvaða mótaðilar mynda gjaldalykilinn eða hvaða gjaldalyklar mynda mótaðilann,
- bókuðu fylgiskjölin sem mynda töluna.

Úr fylgiskjalalistanum má opna bókaða fylgiskjalið og þaðan rekja niður í frumgagn. Sundurliðunin býr því ekki til nýja tölu; hún útskýrir hvaðan talan á stjórnendasýninni kemur.

Ef t.d. er valið **4910 – Veitingakostnaður** má sjá hvernig kostnaðurinn dreifist eftir mánuðum og seljendum og síðan hvaða fylgiskjöl mynda upphæðina. Ef valinn er mótaðili eins og **Olís** má sjá hvaða bókhaldslyklar mynda bókaðan rekstrarkostnað hjá þeim mótaðila.

## Einingarverð og magn

Innsýn getur notað vörulínur sem þegar hafa verið lesnar og varðveittar á fylgiskjali til að fylgjast með **einingarverði** yfir tíma.

Dæmi um mælieiningar sem má greina deterministic eru meðal annars:

- kr./l fyrir eldsneyti og aðra vökva,
- kr./kg fyrir hráefni,
- kr./stk. fyrir vörur,
- kr./kWh fyrir orku,
- kr./klst. fyrir tíma,
- kr./km fyrir akstur þegar gögnin styðja það.

Greiningin kallar **ekki á nýtt AI**. Hún notar aðeins fyrirliggjandi vörulínugögn þar sem magn, mælieining og einingarverð eða ótvírætt línuverð eru til staðar.

Ef einingarverð er ekki skráð sérstaklega má GLÖGGT reikna það sem línuverð deilt með staðfestu magni, en aðeins þegar mælieiningin er þekkt. Kerfið má ekki giska á magn eða verð sem vantar.

Mismunandi stærðareiningar eru normalíseraðar þegar það er öruggt, t.d. ml/cl/l yfir í lítra og g/kg yfir í kg. Þannig má bera sambærileg verð saman án AI.

Einingarverð birtist sem **Þekkt úr vörulínum**, ekki sem ný bókhaldsfærsla. Bókunin sjálf breytist ekki.

Ef aðeins ein staðfest dagsetning er til birtir Innsýn **Síðasta þekkta verð** og merkir skýrt að verðþróun sé ekki enn reiknuð. Margar línur á sama degi teljast ekki sem margar tímasetningar. Þær eru sameinaðar í einn dagspunkt með magnvegnu einingarverði þegar það á við.

Þegar sama sambærilega vara hefur verð á minnst tveimur ólíkum dagsetningum getur Innsýn sýnt:

- nýjasta einingarverð,
- meðalverð,
- breytingu frá síðustu dagsetningu,
- litla verðþróun yfir tíma,
- fjölda dagsetninga og vörulína sem liggur að baki.

Skýr eldsneytisheiti eru sameinuð deterministic án AI þegar línan er í lítrum. Dæmi eru **Dísel**, **Bensín 95**, **Bensín 98** og almennt **Eldsneyti**. Óljós vörulýsing er ekki sameinuð með ágiskun.

Þetta gerir t.d. kleift að sjá hvort aukinn eldsneytiskostnaður skýrist af meiri notkun eða hærra verði á lítra, án þess að AI þurfi að reikna þróunina.

### Lítraverð og eldri eldsneytislínur

Innsýn getur fylgst með verði á lítra án nýs AI-kalls. Nýjar POS-vörulínur varðveita tugabrotsmagn, þannig að t.d. `26,06 l × 218,20 kr./l` helst sem uppbyggð staðreynd. Ef eldri eldsneytislína missti magn eða mælieiningu vegna eldri parser-reglu má kerfið endurheimta lítra deterministic úr prentuðu einingarverði og línuheild, en aðeins þegar eldsneytisheitið er ótvírætt og útreikningurinn stemmir innan námundunarvikmarks. Prentað verð og prentuð línuheild eru áfram heimildin.

### Kafa dýpra í einingarverð

Einingarverðskort í `/innsyn/ny` eru smellanleg. Þegar vara eða þjónusta er valin opnast rekjanleg sundurliðun sem sýnir:

- nýjasta, meðal-, lægsta og hæsta einingarverð á völdu tímabili,
- hverja varðveitta vörulínu með dagsetningu og seljanda,
- magn og canonical mælieiningu,
- einingarverð og varðveitta línuheild,
- hvort einingarverðið kom beint úr vörulínunni eða var reiknað deterministic úr línuheild og magni,
- tengingu niður í bókað fylgiskjal þegar fylgiskjalsnúmer eða receipt-tenging er tiltæk.

Þetta er rekjanleiki, ekki ný greining með AI. Fyrir eldsneyti má því t.d. opna **Dísel**, sjá einstakar úttektir í lítrum og kr./l og fara þaðan niður í fylgiskjalið sem liggur að baki mælingunni.

Einangraðar eða grunsamlegar þjónustulínur eru ekki faldar sjálfkrafa eingöngu vegna þess að þær koma einu sinni fyrir. Fyrst skal nota rekjanleikann niður í frumgagn til að staðfesta hvort línan sé raunveruleg vara/þjónusta eða lýsing/verkefnisheiti; deterministic síun má síðan byggja á staðfestu mynstri fremur en ágiskun.

### Heildarmagn, kostnaður og mánaðarleg notkun

Þegar einingarverðssundurliðun er opin sýnir Innsýn nú einnig deterministic rekstrarmælikvarða úr sömu vörulínum:

- **Heildarmagn** á völdu tímabili, t.d. samtals lítrar.
- **Heildarkostnað** samkvæmt varðveittum línuheildum þegar þær eru tiltækar; annars `magn × einingarverð`.
- **Magnvegið meðalverð**, reiknað sem heildarkostnaður deilt með heildarmagni.
- **Magn og kostnað eftir mánuðum**, ásamt magnvegnu meðalverði hvers mánaðar.

Þetta kallar ekki á AI og flytur engar bókanir. Tilgangurinn er að aðgreina magnþróun frá verðþróun, t.d. hvort hækkun eldsneytiskostnaðar komi vegna fleiri lítra eða hærra kr./l.

### Hvað breyttist og af hverju? – magnáhrif og verðáhrif

Þegar einingarverðssundurliðun hefur gögn fyrir tvo samfellda mánuði birtir Innsýn einnig **Hvað breyttist og af hverju?**.

Sýnin skiptir breytingu á heildarkostnaði í:

- **Magnáhrif** – hvað kostnaðurinn hefði breyst vegna þess að meira eða minna magn var keypt/notað.
- **Verðáhrif** – hvað kostnaðurinn hefði breyst vegna þess að magnvegið meðalverð hækkaði eða lækkaði.

Einnig sést breyting á magni og breyting á meðalverði milli mánaðanna. Útreikningurinn er deterministic og samhverfur þannig að magnáhrif + verðáhrif = heildar kostnaðarbreyting. Það er því enginn óútskýrður afgangur sem AI þarf að túlka.

GLÖGGT ber ekki saman yfir gat í tímaröð eins og um samfellda mánuði sé að ræða. Ef t.d. gögn eru í apríl og júní en ekki maí er apríl → júní ekki notað sem beinn mánaðarsamanburður.

Dæmigert dæmi er eldsneyti: ef kostnaður hækkar frá júlí í ágúst getur Innsýn sýnt sérstaklega hversu margar krónur hækkunarinnar komu frá fleiri lítrum og hversu margar frá hærra kr./l.

### Sama greining fyrir tíma, stykki og aðrar mælieiningar

Einingarverðslagið er ekki sérlausn fyrir eldsneyti. Sama deterministic grunnlína er notuð fyrir allar studdar canonical mælieiningar, en orðalag stjórnendasýnar lagar sig að merkingu einingarinnar.

Dæmi:

- `klst.` → **Heildartímar**, **Tímar og kostnaður eftir mánuðum**, **Tímaáhrif** og **Breyting á tímum**.
- `stk.` → **Heildarfjöldi**, **Fjöldi og kostnaður eftir mánuðum**, **Fjöldaáhrif** og **Breyting á fjölda**.
- `kg` → **Heildarþyngd** og **Þyngdaráhrif**.
- `kWh` → **Heildarnotkun** og **Notkunaráhrif**.
- `km` → **Heildarkílómetrar** og **Akstursáhrif**.
- `m`, `m²` og `m³` fá samsvarandi lengdar-, flatarmáls- og rúmmálsmerkingu.

Stærðfræðin breytist ekki: heildarkostnaður, vegið meðalverð og verð-/magnáhrif eru alltaf reiknuð úr varðveittu magni, canonical mælieiningu, einingarverði og línuheild. Aðeins framsetningin verður skýrari fyrir þá einingu sem verið er að skoða. Ekkert nýtt AI-kall er notað.

### Einingarverð: tekjur, kostnaður og sami verðgrunnur

Í rekjanleika einingarverðs notar GLÖGGT sama verðgrunn og einingarverðið sjálft. Ef einingarverð er prentað/geymt er línuverðmæti reiknað sem magn × einingarverð. Þetta kemur í veg fyrir að nettó- og brúttóupphæðir blandist saman í meðaltölum eða verð-/magnáhrifum.

Ef bókunin inniheldur tekjulykil sýnir Innsýn Heildartekjur og tekjubreytingu. Ef hún inniheldur gjaldalykil sýnir Innsýn Heildarkostnað og kostnaðarbreytingu. Ef áttin er ekki ótvíræð er notað hlutlaust heiti, Heildarlínuverðmæti.
