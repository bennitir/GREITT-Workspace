GLÖGGT – Admin/Stjórnstöð i18n sweep
18.09.2026

Innihald pakkans er frá project-rót og má losa beint í C:\GLÖGGT.

Breytingar:
- Stjórnstöð/Admin yfirlit fylgir interfaceLanguage.
- Admin efri valmynd fylgir interfaceLanguage.
- Kostnaður fylgir interfaceLanguage.
- Fyrirtækjalisti, notendalisti, kerfisstillingar og Ábendingar fylgja interfaceLanguage.
- Fyrirtækja-admin smáatriði, bókhaldsferli, einingar og notendaheimildir fylgja interfaceLanguage.
- Admin company action buttons + confirm textar fylgja interfaceLanguage.
- Lokuð fyrirtæki og Nýtt fyrirtæki fylgja interfaceLanguage.
- Dagsetningar á Admin-síðum nota viðeigandi locale.
- Fyrirtækjanöfn, kennitölur og önnur frumgögn eru ekki þýdd.
- Engin Prisma migration.

Próf:
npx tsc --noEmit
