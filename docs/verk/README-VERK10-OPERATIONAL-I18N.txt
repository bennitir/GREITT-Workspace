GLÖGGT – Verk 10: þýðanlegt vinnuefni / operational i18n
18. september 2026

Pakkinn er ætlaður til að losa beint í C:\GLÖGGT.
Engin aukamappa er utan um app/ og lib/.

Markmið þessa skrefs:
- Starfsmannaviðmótið á ekki aðeins að þýða fasta UI-texta.
- Heiti Verks, lýsing og heiti/lýsing Verkþáttar geta einnig birst á tungumáli starfsmanns.
- Frumtexti fyrirtækisins er alltaf varðveittur óbreyttur.
- Þýðing er sjálfstæð birting og má aldrei yfirskrifa frumtextann.
- Nöfn, heimilisföng, verknúmer og önnur auðkenni eru ekki þýdd.

Nýtt í domain-kjarnanum:
- Work10LocalizedText
- Work10OperationalTranslation
- Work10TranslationSource
- resolveWork10LocalizedText()
- Work10Part.title er nú Work10LocalizedText í stað venjulegs string.
- Work10Part.description er einnig tilbúin fyrir þýðanlegt vinnuefni.

Reynsluakstur án migration:
- lib/work10/legacy-operational-text.ts inniheldur MJÖG AFMARKAÐAR tímabundnar
  TEST_PROJECTION þýðingar fyrir núverandi prófunarverk „Tengja fráfall frá þurrkara“.
- Þetta er aðeins til að sannreyna flæðið á íslensku, ensku, pólsku og serbnesku núna.
- Þetta er EKKI framtíðar þýðingargeymsla og á að hverfa þegar varanlegt gagnalíkan
  fyrir rekjanlegar þýðingar er sett inn.
- Ef þýðing vantar sýnir GLÖGGT frumtextann; kerfið skáldar ekki texta í hljóði.

Öryggi:
- Engin Prisma migration.
- Engin ný gagnagrunnsfærsla.
- Núverandi /verk er ósnert.
- Núverandi frumtexti WorkOrder er ekki breyttur.

Eftir afritun:
  npx tsc --noEmit

Prófa:
  http://localhost:3000/verk10

Skipta síðan um tungumál í Mínar stillingar og staðfesta að bæði:
- heiti Verks/Verkþáttar,
- lýsing Verks
skipti um birtingartungumál en Aragerði 7, nöfn fólks og #3 haldist óbreytt.
