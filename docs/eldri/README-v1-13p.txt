GLÖGGT v1.13p — Verk desktop, fjöltyngt viðmót

Innihald:
- app/verk/page.tsx
- app/verk/nytt/page.tsx
- app/verk/[id]/page.tsx
- components/work/WorkLogForm.tsx
- components/work/EditWorkLogForm.tsx
- components/work/WorkLogEditToggle.tsx
- lib/i18n/work.ts

Breytingar:
- Verk desktop fylgir nú interfaceLanguage: is / en / pl / sr.
- Listi, staða, forgangur, nýtt verk, verkdetail og verkstundaform eru þýdd.
- Dagsetningar í verkdetail fylgja viðmótstungumáli.
- Heiti/lýsing/heimilisfang verks og nöfn starfsmanna eru varðveitt sem upprunagögn og eru ekki vélþýdd.
- Engin Prisma migration og engin gagnabreyting.

Setja yfir samsvarandi skrár í C:\GLÖGGT og keyra:
  npx tsc --noEmit

Prófa síðan /verk á is, en, pl og sr áður en commit/push er gert.
