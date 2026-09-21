GLÖGGT – Verk 10: i18n + fyrsti Verkþáttur
18. september 2026

Þessi pakki er ætlaður til að losa beint í C:\GLÖGGT.
Engin aukamappa er utan um app/ og lib/.

Breytingar:
- Verk 10 les nú interfaceLanguage úr UserSettings.
- Notandasýnilegir textar í /verk10 og /verk10/[id] fara í gegnum lib/i18n/work10.ts.
- Íslenska, enska, pólska og serbneska eru settar inn fyrir nýja Verk 10 viðmótið.
- Dagsetning er formöttuð deterministic úr tungumálalaginu til að forðast hydration-mismatch.
- Fyrsti raunverulegi Work10Part er nú notaður í viðmótinu.
- Núverandi WorkOrder er varpað yfir í einn read-only Work10Part í lib/work10/legacy-bridge.ts.
- Work10Part er sýnilegur bæði í dagskipulagi/hægra spjaldi og á /verk10/[id].
- BLOCKED er bætt við Work10PartStatus fyrir framtíðar verkflæði.

Öryggi:
- Engin Prisma migration.
- Engin ný gagnagrunnsfærsla.
- Núverandi /verk er ósnert.
- Brúin er eingöngu projection/read-only; persistedInWork10=false.

Eftir afritun:
  npx tsc --noEmit

Prófa:
  http://localhost:3000/verk10

Prófa síðan tungumál undir Mínar stillingar og endurhlaða /verk10.
