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
