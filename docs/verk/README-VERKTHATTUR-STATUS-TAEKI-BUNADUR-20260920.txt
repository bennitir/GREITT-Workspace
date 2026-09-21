GLÖGGT – Verkþáttastaða + Tæki / búnaður – 20.09.2026

Markmið
- Laga villandi stöðusvið Verkþáttar á desktop: eftir vistun á „Lokið“ gat stöðumerkið orðið rétt en select-sviðið haldið gömlu „Í vinnu“ DOM-stöðunni.
- Koma í veg fyrir að næsta vistun opni Verkþátt óvart aftur vegna gamals select-gildis.
- Gera tækjasíðuna /verk/tilfong beint aðgengilega af Verk-síðunni sem „Tæki / búnaður“.

Breytingar
- updateWorkPartStatus endar nú á redirect aftur á sama Verk og viðkomandi Verkþátt.
- Stöðu-select fær key sem inniheldur vistaða stöðu svo React endurstofni rétt gildi eftir breytingu.
- Verkþáttaspjald fær anchor-id svo redirect lendir aftur á réttum stað.
- Verk-yfirlit fær beina i18n-hæfa leið í /verk/tilfong: Tæki / búnaður / Equipment / Sprzęt / Опрема.

Engin Prisma-breyting eða migration.

Próf
1. npx tsc --noEmit
2. Á /verk/[id]: breyta Verkþætti Í vinnu -> Lokið og Vista stöðu.
3. Staðfesta að bæði stöðumerki og select sýni Lokið eftir endurhleðslu.
4. Endurhlaða síðu og staðfesta að Lokið haldist.
5. Á /verk: opna Tæki / búnaður og staðfesta að /verk/tilfong opnist.
