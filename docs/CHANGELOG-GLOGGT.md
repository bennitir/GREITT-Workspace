# GLÖGGT – þróunarsaga

## 2026-08-20 – frumgerðarpakki 1

### Öryggi fylgiskjalsnúmera
- Ný `VoucherNumberReservation` tafla með `UNIQUE(companyId, voucherNumber)`.
- Eldri bókuð AI-skjöl og handvirk skjöl eru sett í reservation-töfluna í migration.
- Sjálfvirk fylgiskjalsnúmer eru tekin með atomic SQLite `UPDATE ... RETURNING`, svo tveir notendur sama fyrirtækis fá ekki sama næsta númer.
- Bæði AI-bókun og handvirk bókun taka reservation áður en bókun er vistuð.
- Bætt við vantaðri stöðvun í handvirkri bókun ef númer er þegar í notkun.

### Nýjar vafranlegar frumgerðir
- `/vinnustundir` – hönnunarskissa + vinnusvæði.
- `/laun` – hönnunarskissa + vinnusvæði.
- `/sala` – vinnuskissa fyrir næstu hönnunarumferð.
- `/birgdir` – vinnuskissa fyrir næstu hönnunarumferð.
- Sidebar tengir nú virkar einingar við þessar raunverulegu slóðir.
- Allar fjórar slóðir nota sameiginlega module-vörn og opnast aðeins ef einingin er virk hjá virka fyrirtækinu.

### Eftir uppsetningu
Keyra þarf Prisma migration/generate áður en nýja bókunarvörnin er prófuð.
