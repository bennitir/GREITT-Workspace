GLÖGGT – Verk Mobile framkvæmdarkjarni
19. september 2026

Markmið
------
Færa Mobile Verk frá einföldum verkalista yfir í raunverulega framkvæmdarsýn sem skrifar í sama WorkPart-kjarna og desktop Verk.

Helstu breytingar
-----------------
1. /mobile/verk er nú starfsmiðað yfirlit:
   - „Mín verk“ eftir beinni úthlutun eða teymisúthlutun.
   - „Önnur virk verk“ áfram sýnileg svo starfsmaður geti fundið rétt Verk.
   - leit eftir heiti, verknúmeri, verklykli, staðsetningu og Verkþáttum.
   - virkur Mobile-tímamælir er sýndur ef hann er í gangi.
   - rekstrartexti er birtur á valda Mobile-tungumálinu þegar varðveitt þýðing er til.

2. Ný /mobile/verk/[id] framkvæmdarsíða:
   - sýnir varanlega Verkþætti, dependencies, stöðu, úthlutanir og auðlindir.
   - starfsmaður getur hafið vinnu, stöðvað tímamælingu, sett Verkþátt í bið og lokið honum.
   - einn starfsmaður getur aðeins haft eina virka Mobile-tímamælingu í sama fyrirtæki.
   - upphaf og lok skrifast í WorkPartLaborFact með source=MOBILE.
   - WorkOrder-staða er samstillt út frá Verkþáttum; annar sannleikur um stöðu er ekki stofnaður.
   - FINISH_TO_START dependencies eru varin líka í server action, ekki bara í UI.
   - Verkþáttur má ekki lokast meðan annar starfsmaður er enn með virka tímamælingu á honum.

3. Efnisnotkun úr Mobile:
   - lagerhaldin vara + lagerstaður + magn.
   - sannreynir lausa lagerstöðu áður en skráð er.
   - stofnar WorkPartUsageFact og tengda WORK_USAGE InventoryMovement í sömu transaction.
   - innkaupskostnaður hreyfingarinnar er áfram sögulegi kostnaðargrunnurinn.

4. Auðlindanotkun úr Mobile:
   - úthlutaðar vélar, farartæki, verkfæri og verktakar má skrá sem raunnotkun.
   - notkun er sjálfstæð frá úthlutun.
   - resourceUnitCostIsk er snapshot af gildandi innra kostnaðarverði við skráningu.

5. Mælastaða úr Mobile:
   - úthlutaðar MACHINE / VEHICLE / TOOL auðlindir geta fengið nýja mælistöðu.
   - tengist WorkPart og source=MOBILE.
   - mælir má ekki lækka í venjulegu Mobile-flæði; leiðrétting eldri mælis á að fara sérstaka yfirferð.

6. Mobile-aðgangur:
   - bókhaldsheimildir eru ekki notaðar sem starfsheimild til tímaskráningar.
   - virkur notandi með fyrirtækisaðgang getur skoðað Verk.
   - til að skrá eigin framkvæmd þarf notandinn að vera tengdur virkum Employee.
   - Employee.preferredLanguage hefur forgang í Mobile; annars UserSettings.interfaceLanguage.

7. Fjöltyngi
------------
Nýtt textalag lib/i18n/work-mobile.ts fyrir is/en/pl/sr.
Frumtexti Verks/Verkþáttar er áfram varðveittur óbreyttur; varðveitt þýðing er aðeins birtingarlag.

Ekki í þessari lotu
-------------------
- QR-skönnun Verks/auðlindar.
- mynd af mæli.
- viðhaldslyklar og viðhaldsáætlanir.
- „næsti lausi“ / raðverk og drag-and-drop skipulag.
- sjálfvirk hlé/kaffi/matarregla.
- verktaka-SMS/QR aðgangur.

Engin Prisma migration er í þessari lotu. Hún notar WorkPart, WorkPartLaborFact,
WorkPartUsageFact, WorkResource, WorkResourceMeterReading og InventoryMovement sem
voru þegar komin í kjarnann.
