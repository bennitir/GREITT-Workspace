# AI-kostnaður – greining og eftirlit

GLÖGGT skráir AI-köll svo hægt sé að sjá hvað kostar og hvort deterministic vinnsla sé að spara AI-notkun eins og ætlað er.

## Nýleg AI-köll

Í **GLÖGGT Admin → Kostnaður** má skoða nýleg köll. Fyrir hvert kall sjást:

- heildartoken,
- inntakstoken,
- hversu mörg inntakstoken komu úr prompt-cache,
- úttakstoken,
- reiknaður kostnaður.

Fyrir ný fylgiskjalaköll varðveitir GLÖGGT einnig grófa stærð á því samhengi sem sent var, m.a. lengd frumtexta og breytilegs fyrirtækjasamhengis. Þetta er greiningargagn; það inniheldur ekki sjálfan prompt-textann.

## Hvernig á að lesa tölurnar

Hátt heildartoken-gildi segir ekki eitt og sér hvað kostaði mest. Cached inntak er reiknað á lægra verði en ócached inntak og úttak getur verið hlutfallslega dýrt. Þess vegna skal skoða sundurliðunina áður en prompt er styttur eða virkni tekin út.

Markmið fylgiskjalavinnslu er áfram **gögn fyrst, AI síðan**: deterministic lestur, staðfest þekking og lærdómur eiga að leysa sem mest áður en AI er kallað.
