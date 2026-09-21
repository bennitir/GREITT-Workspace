GLÖGGT – Verk – lífsferill, lokun og endurvirkjun
20. september 2026

Markmið
- Verk lokast ekki sjálfkrafa þegar síðasti Verkþátturinn klárast.
- Allir Verkþættir mega vera í lokastöðu á meðan Verkið sjálft bíður eftir stjórnandaákvörðun.
- Stjórnandi sér „Tilbúið til lokunar“ og staðfestir „Ljúka Verki“.
- Aðeins eftir þá staðfestingu færist Verkið úr virkri sýn í Lokið Verk.
- Tímar, úthlutanir, efnisnotkun, tæki og audit-saga varðveitast.
- Lokuðu Verki má endurvirkja með staðfestingu. Loknir Verkþættir haldast loknir þar til þeim er breytt sérstaklega eða nýjum Verkþætti er bætt við.

Öryggisreglur
- Ekki má loka Verki fyrr en allir Verkþættir eru í lokastöðu (COMPLETED/CANCELLED).
- Ekki má loka Verki meðan virk WorkPartLaborFact tímaskráning er í gangi.
- Lokun og endurvirkjun skrifa AuditEvent.
- Mobile starfsmaður sér áfram fyrst og fremst opna Verkþætti. Stjórnandasýn má sjá Verk sem bíður lokunar.

Engin Prisma migration
WorkOrder.status er þegar String og ný hegðun notar núverandi COMPLETED/IN_PROGRESS merkingu.

Prófun
1. Ljúka síðasta Verkþætti.
2. Staðfesta að Verkið sé áfram virkt og merkt „Tilbúið til lokunar“.
3. Staðfesta að Lokið Verk aukist ekki fyrr en „Ljúka Verki“ er staðfest.
4. Prófa lokun með virkri tímaskráningu – lokun á að vera læst/hafnað.
5. Ljúka Verki og staðfesta að það færist í Lokið Verk.
6. Endurvirkja Verkið og staðfesta að það komi aftur í virka sýn.
7. Staðfesta að saga/tímar/úthlutanir hafi ekki tapast.
