GLÖGGT – Verk / lifandi tímasýn 20.09.2026

Breyting:
- Dagskipulag notar áfram 10 klst. sýnilegan glugga, en hann er ekki lengur fastur 07:00–17:00.
- Á deginum í dag fylgir glugginn núverandi klukku sjálfkrafa.
- Rauð lína sýnir núverandi tíma og færist eftir klukkunni.
- Örvar færa sýnina eina klukkustund aftur eða áfram.
- „Núna“ færir sýnina aftur að núverandi tíma og virkjar sjálfvirka eftirfylgni á ný.
- Þegar stjórnandi færir tímasýnina handvirkt hættir hún að hoppa aftur að klukkunni þar til „Núna“ er valið.
- Fyrir aðra daga byrjar sýnin á 07:00 en má færa frjálst innan sólarhringsins.
- Smellur á Verk undir „Utan sýnilegs tímaramma“ færir gluggann að tíma þess Verks.
- Sýnilegur gluggi er takmarkaður við 00:00–24:00 sama dags.
- Engin Prisma-breyting og engin migration.

Próf:
1. npx tsc --noEmit
2. Opna Dagskipulag fyrir daginn í dag þegar klukkan er eftir 17:00.
3. Staðfesta að núverandi tími sé innan sýnilegs glugga og rauð „Nú“-lína birtist.
4. Prófa ← og →; glugginn á að færast um eina klukkustund.
5. Smella á „Núna“; glugginn á að hoppa aftur að núverandi tíma og fylgja klukkunni.
6. Velja annan dag; sýnin á að byrja 07:00 og vera færslanleg.
