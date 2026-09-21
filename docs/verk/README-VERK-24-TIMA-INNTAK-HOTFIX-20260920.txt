GLÖGGT – Verk: 24 tíma upphafstími / liðinn tími – hotfix 20.09.2026

Breyting:
- Native <input type="time"> er ekki lengur notað fyrir áætlað upphaf Verks.
- Áætlað upphaf er skráð sem Klst. 0–23 og Mín. 0–59.
- Framsetning er því óháð AM/PM stillingum í Windows/vafra.
- Leyfilegt er að velja tíma sem er þegar liðinn sama dag; áætlun má skrá eða leiðrétta eftir á.
- Ef bæði Klst. og Mín. eru auð er Verkið ótímasett þann dag.
- Ef aðeins Klst. er skráð er mínútugildi túlkað sem 00.
- Mínútur án klukkustundar eru hafnað sem ógildum tíma.
- Engin Prisma-breyting og engin migration.

Próf:
npx tsc --noEmit

Síðan prófa:
1. Verk í dag með liðnum tíma, t.d. 14:30.
2. Verk í dag með framtíðartíma, t.d. 19:00.
3. Verk í dag án Klst./Mín. -> Ótímasett í dag.
4. Breyta þegar stofnuðu Verki og staðfesta að tíminn birtist áfram sem HH:MM.
