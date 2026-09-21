GLÖGGT – Verk 10, sjónrænn reynsluakstur
18.09.2026

Þessi pakki er ætlaður til að losa beint inn í C:\GLÖGGT.
Engin aukamappa á að vera utan um app og lib.

Breytingar:
- app/verk10/page.tsx les núverandi WorkOrder, WorkLog og virka fyrirtækisnotendur.
- app/verk10/Work10Dashboard.tsx bætir við sjónrænu Dagskipulagi nálægt samþykktri Verk-hönnun.
- app/verk10/[id]/page.tsx fylgir með sem núverandi Verk 10 detail reynsluakstur.
- lib/work10/domain.ts fylgir með sem domain-kjarni v0.

Öryggi:
- Engin Prisma schema breyting.
- Engin migration.
- Engin ný gögn eru skrifuð í gagnagrunninn.
- /verk er ósnert.
- Form og nýjar aðgerðir sem myndu skrifa gögn eru óvirkar.

Eftir afritun:
1. npx tsc --noEmit
2. Opna http://localhost:3000/verk10
