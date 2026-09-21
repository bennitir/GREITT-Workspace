GLÖGGT – Verk / Dagskipulag: dagsetning og upphafstími
20.09.2026

Markmið
- Dagskipulag má ekki staðsetja Verk á tilbúnum/fölsuðum tíma.
- Áætlun og raunvinna eru áfram tvö aðskilin hugtök.
- Úthlutun starfsmanns byrjar ekki tímaskráningu.

Ný gögn á WorkOrder
- plannedDate: staðbundinn áætlaður rekstrardagur (Postgres DATE).
- plannedStartMinutes: valkvæður klukkutími sem mínútur frá miðnætti.
- estimatedMinutes heldur áfram að vera áætluð lengd.

Hegðun
1. Við stofnun Verks má velja áætlaðan dag og áætlað upphaf.
2. Dagur má vera skráður án klukkutíma. Þá birtist Verkið undir „Ótímasett í dag“.
3. Verk án dags birtist áfram í Verklista en er ekki sett sjálfkrafa á dagskipulag.
4. Tímasett Verk birtist á réttum stað á 07:00–17:00 tímalínu samkvæmt plannedStartMinutes og estimatedMinutes.
5. Verk utan sýnilegs tímaramma er ekki falið; það birtist í sérstakri „Utan sýnilegs tímaramma“ röð.
6. Á starfsmannaröðum birtist blá áætlun og raunvinna fyrir neðan sem sjálfstæð skráning.
7. Tillögur að lausum starfsmönnum nota nú tímasett árekstrargögn þegar dagur, upphaf og lengd liggja fyrir. Ótímasett úthlutun telst áfram óvissa. Vaktir, hæfni og ferðatími eru ekki fundin upp ef gögn vantar.
8. Áætluðum degi og tíma má breyta á Verksíðunni eftir stofnun.

Migration
- 20260920173500_add_work_scheduling

Próf
npx prisma validate
npx prisma generate
npx prisma migrate deploy
npx tsc --noEmit

Mikilvægt raunpróf
- Stofna Verk á daginn í dag, t.d. 14:00, 30 mín.
- Staðfesta að kortið byrji við 14:00 og endi við 14:30.
- Stofna Verk á sama degi án upphafstíma og staðfesta „Ótímasett í dag“.
- Stofna Verk án dags og staðfesta að það sé í Verklista en ekki sett á tilbúinn tíma.
- Úthluta starfsmanni og staðfesta að áætlun birtist í hans röð án þess að tímaskráning byrji.
