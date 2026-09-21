GLÖGGT – Verk 10 runtime/hydration fix
18.09.2026

Tilgangur:
- Lagfæra hydration mismatch á dagsetningu.
- Verja dateFromIsoDate gegn undefined/missing initialDate við HMR/stale client state.
- Nota UTC/deterministic dagsetningarútreikning í fyrstu renderingu.
- Halda Verk 10 capability-prófuninni óbreyttri (þ.m.t. valkvæðar Vinnuvélar).
- Engin Prisma migration.

Pakkinn er frá rót verkefnis og má losa beint í C:\GLÖGGT.
Keyra síðan: npx tsc --noEmit
