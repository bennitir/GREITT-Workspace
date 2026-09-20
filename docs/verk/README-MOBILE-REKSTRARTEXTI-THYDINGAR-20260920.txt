GLÖGGT – Verk/Mobile rekstrartexti á tungumáli starfsmanns
20. september 2026

Markmið
------
Starfsmaður má ekki aðeins sjá hnappa og stöður á sínu tungumáli; hann þarf að skilja sjálft Verkið. Þessi breyting tengir núverandi WorkOrderTranslation / WorkPartTranslation grunn sjálfvirkt við Mobile.

Reglan
------
1. Frumtexti WorkOrder og WorkPart er alltaf varðveittur óbreyttur.
2. GLÖGGT leitar fyrst að fyrirliggjandi þýðingu fyrir tungumál starfsmanns.
3. AI er aðeins kallað ef viðkomandi reit/tungumál vantar.
4. AI-þýðing er vistuð sem sjálfstæð translation-færsla og skrifar ekki yfir frumtextann.
5. Fyrirliggjandi mannleg þýðing er ekki yfirskrifuð af sjálfvirkri samstillingu.
6. Ef AI er tímabundið ótiltækt heldur Mobile áfram að sýna frumtexta; úthlutun og push mega ekki bila vegna þýðingar.

Hvenær samstillist
------------------
- Þegar starfsmaður er úthlutaður á Verkþátt er reynt að undirbúa þýðingu fyrir hans virka Mobile/viðmótstungumál.
- Þegar teymi er úthlutað eru tungumál virkra teymismeðlima notuð.
- Þegar starfsmaður opnar Mobile Verk-lista er athugað hvort úthlutuð virk Verk vanti þýðingu.
- Þegar ákveðið Verk er opnað í Mobile er sama athugun gerð fyrir það Verk og síðan er Mobile-sýnin endurhlaðin ef nýjar þýðingar voru búnar til.
- Áður en forgangspush er samið er reynt að tryggja að Verkheitið sé til á tungumálum viðtakenda.

Kostnaður og gögn fyrst
-----------------------
Þetta fylgir GLÖGGT-reglunni „Gögn fyrst, AI síðan“: gagnagrunnur/staðfestar þýðingar eru alltaf notaðar fyrst. AI fær aðeins þá stuttu rekstrarreiti sem vantar fyrir tungumál sem raunverulega þarf. Sama þýðing er ekki búin til aftur ef hún er þegar til.

Umfang núna
------------
Sjálfvirka Mobile-samstillingin nær yfir:
- Verkheiti
- Verklýsingu
- heiti Verkþáttar
- lýsingu/leiðbeiningu Verkþáttar

Vinnunótur/labor-facts halda áfram að eiga translation-grunn en eru ekki sjálfkrafa massþýddar í þessari lotu, til að þýða ekki sögulegan texta sem starfsmaður þarf ekki til að framkvæma núverandi Verk.

Engin Prisma migration
----------------------
Engin ný tafla eða schema-breyting er nauðsynleg. Notaðar eru núverandi WorkOrderTranslation og WorkPartTranslation töflur.
