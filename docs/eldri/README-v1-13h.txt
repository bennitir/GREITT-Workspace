GLÖGGT tungumál – reikningslyklabirting v1.13h

Setjið innihald ZIP yfir C:\GLÖGGT og leyfið að sameina möppur/yfirskrifa þessar skrár.

Breytt:
- Nýtt sameiginlegt birtingarlag: lib/i18n/accounts.ts
- Staðlaðir GLÖGGT reikningslyklar halda sama númeri og sama Account.name í gagnagrunni.
- Birtingarheiti geta nú fylgt viðmótstungumáli: is / en / pl / sr.
- Innsýn notar birtingarlagið bæði í útgjaldagreiningu, þekktum lánum og afborgunum.
- Sérsmíðaðir/notendastofnaðir lyklar sem ekki eru í staðlaða kortinu eru sýndir nákvæmlega eins og þeir eru vistaðir.
- Engin Prisma migration. Engum bókuðum færslum eða lærðum gögnum er breytt.

Próf:
  npx tsc --noEmit

Dæmi á ensku:
  2220 – Financing and equipment loans
  4740 – Vehicle fees
  4980 – Payment and collection fees
  5110 – Interest on bank loans
  5120 – Indexation
