GLÖGGT – Heimasvæði / heimildagrunnur – 15.09.2026

Afrita innihald pakkans yfir C:\GLÖGGT með sömu möppubyggingu.

Breytingar:
- app/page.tsx: nýr fjöltyngdur „Vinnan mín“ hluti á Heimasvæði.
- lib/i18n/home.ts: textalag fyrir íslensku, ensku, pólsku og serbnesku.
- lib/core/access-control.ts: UserCompany aðgerðarheimildir verða frumheimild;
  eldri canBook/canReview o.fl. haldast sem samhæfingarlag.

Engin Prisma migration í þessum pakka.

Eftir afritun:
  npx tsc --noEmit

Ekki commit-a fyrr en TypeScript prófið er hreint og Heimasvæðið hefur verið skoðað.
