# GLÖGGT – vinnudagbók 1. október 2026

**Dagsetning:** fimmtudagur 1. október 2026  
**Dagslok:** rétt eftir miðnætti, um kl. 00:03 þann 2. október 2026  
**Meginþemu dagsins:** einangraður Sala-worktree, sjálfstæður Sala-kjarni, tenant-safe heimildir, Sale/SaleLine/Payment þjónustulag, fyrsta raunverulega Sala-viðmótið, sölustaðir og sölustöðvar í Stjórnun, sér migration, production DB deploy, Turbopack/worktree lagfæring og end-to-end smoke-test á raunverulegum gögnum. Í lok dags var Astra sett af stað yfir nótt í aðal-workspace til að halda áfram duplicate-vörn fyrir endurtekin lánaskjöl, án þess að snerta Sala-greinina.

---

## 1. Yfirlit dagsins

1. október varð dagurinn þar sem **GLÖGGT Sala fór úr arkitektúr yfir í fyrsta raunverulega, keyrandi kjarnann**.

Mikilvægasta verkstjórnunarákvörðunin var tekin strax: vinna við Sölu skyldi fara í sér Git-worktree og sér branch svo hún gæti þróast án þess að trufla ókláraða vinnu í `C:\GLÖGGT` um duplicate-vörn, document-instance identity og endurtekin lánaskjöl.

Sala-worktree var því byggt í:

`C:\GLÖGGT-SALA`

á branch:

`feature/sala-v1`

með grunncommit:

`1579835` – **Add versioned document instance envelope state**

Dagurinn skiptist síðan í fjóra meginhluta:

1. **Arkitektúr og gagnalíkan Sölu** – fyrirtækjahópar, sölustaðir, sölustöðvar, Sale, SaleLine og Payment.
2. **Aðgangur og þjónustulag** – action-specific Sala-heimildir, service/repository-lag og server action boundary.
3. **Raunverulegt UI og Stjórnun** – fyrsta sölusvæðið, sölustaðastillingar, terminal-stillingar og fjögurra tungumála textalag.
4. **Migration + production smoke-test** – hreint Sala-only migration, deploy á Supabase og fyrstu raunverulegu sölurnar í browser.

Dagurinn endaði með því að Sala var staðfest end-to-end gegn raunverulegum gagnagrunni:

- sölustaður stofnaður;
- sölustöð stofnuð;
- sala án terminal keyrð í gegn;
- sala með terminal keyrð í gegn;
- línur, VSK, bið/halda áfram og lokun virkuðu;
- gögn varðveittust eftir refresh;
- migration-status sýndi allar 76 migrations applied.

Í lokin var ákveðið að **stoppa Sölu þar**, ekki byrja greiðslu-/checkout-lagið sama kvöld, og setja Astra í staðinn af stað yfir nótt til að klára verkefnið frá deginum áður í aðal-workspace um duplicate-vörn fyrir endurtekin lánaskjöl.

---

# 2. Vinnusvæðaskipting – verja aðalrepoið

Ókláruð og viðkvæm vinna var enn í `C:\GLÖGGT` frá 30. september, sérstaklega um:

- document instance identity;
- obligation identity;
- duplicate-vörn fyrir endurtekin lánaskjöl;
- Festa/Landsbankinn dæmið með sama lánanúmeri yfir mismunandi afborganir.

Því var ákveðið að Sala mætti **ekki** blandast inn í sama vinnusvæði.

Nýtt worktree var stofnað:

```powershell
git worktree add -b feature/sala-v1 C:\GLÖGGT-SALA 1579835
```

Grundvallarregla dagsins:

> `C:\GLÖGGT` og `C:\GLÖGGT-SALA` eru tvö aðskilin verkefnasamhengi. Sala má ekki hreinsa, resetta, stage-a eða eyða neinu í aðal-workspace.

Þessi aðskilnaður reyndist mjög mikilvægur síðar um kvöldið þegar Astra var sett af stað aftur í `C:\GLÖGGT` án þess að snerta Sala-greinina.

---

# 3. Sala – grunnarkitektúr

Sala var mótuð sem **sjálfstæður rekstrarkjarni**, ekki sem undirhluti Bókhalds.

Helstu reglur sem voru festar:

- `Sale` er rekstrarstaðreynd Sölu;
- `Invoice` verður síðar aðskilið formlegt skjal;
- `Payment` er aðskilið frá `Sale`;
- split-payment þarf að vera mögulegt;
- `Fulfilment` verður sér lag;
- Birgðir og Bókhald fá síðar canonical facts/events frá Sölu í stað þess að Sala skrifi beint í þau;
- `Work` má tengjast Sölu í báðar áttir;
- Innsýn les staðreyndir en stýrir ekki transactional kjarna.

Grunnlíkanið:

```text
Sale
 ├── SaleLine[]
 ├── Payment[]
 ├── Customer?        (síðar tenant-safe)
 ├── Fulfilment[]     (síðar)
 ├── Invoice?         (síðar)
 ├── Inventory links (síðar)
 ├── Work links       (síðar)
 └── immutable/audited events (síðar)
```

Sale-statusar:

- `DRAFT`
- `HELD`
- `FINALIZED`
- `CANCELLED`
- `RETURNED`

Payment-statusar:

- `PENDING`
- `AUTHORIZED`
- `CONFIRMED`
- `FAILED`
- `CANCELLED`
- `REFUNDED`

Mikilvæg regla:

> Lokun sölu og staða greiðslu eru ekki sami hlutur.

---

# 4. Fyrirtækjahópar, sölustaðir og sölustöðvar

Fyrsta skipulagslag Sölu var byggt þannig að það nýtti núverandi rekstrarstaði GLÖGGT í stað tvískráningar.

Skipulag:

```text
CompanyGroup
 └── Company
      └── OperationalLocation
           └── SalesBranch
                └── SalesTerminal?
```

`SalesBranch` er því **söluhlutverk á sameiginlegri OperationalLocation**.

Heimilisfang og rekstrarstaður eru ekki tvítekin í Sölu.

`SalesTerminal` getur verið:

- `POS`
- `MOBILE`
- `WEB`
- `OTHER`

Sölustöð er valkvæð á einstökum `Sale`. Það gerir t.d. mögulegt að framtíðarsala úr Work/Quote/Order verði til án tilbúins kassa eða símastöðvar.

Tenant-safe composite relations voru notaðar til að tryggja að:

- branch tilheyri sama company;
- terminal tilheyri sama branch og company;
- Sale geti ekki vísað í terminal annars fyrirtækis eða annars branch.

Commit:

`09f4a9a` – **Add sales organization and terminal foundation**

---

# 5. Sala-heimildir – action-specific og fail-closed

Sala fékk sértækar heimildir í `UserCompany` í stað þess að erfa gamalt `canWrite`.

Heimildirnar:

- `SALE_USE`
- `SALE_HOLD`
- `SALE_DISCOUNT`
- `SALE_CHANGE_PRICE`
- `SALE_INVOICE`
- `SALE_REFUND`
- `SALE_VOID`
- `SALE_SETTLEMENT_VIEW`
- `SALE_SETTLEMENT_CREATE`
- `SALE_SETTLEMENT_FINALIZE`
- `SALE_CUSTOMER_MANAGE`
- `SALE_SETTINGS_MANAGE`

Öll boolean-gildi default-a á `false`.

Global `ADMIN` fær heimildir í access-control, en venjulegur notandi fær aðeins þær heimildir sem eru explicit geymdar fyrir fyrirtækið.

Mikilvæg regla:

> Sala-heimildir gefa ekki legacy almennt write-access og hlutverk mappast ekki sjálfkrafa yfir í Sala-heimildir.

Sala-heimildastjórnun var færð í sameiginlegt **Stjórnun**-svæði og birtist aðeins þegar Sala er virk í entitlement/áskrift fyrirtækis.

Commit:

`8f1e5f8` – **Add sales user permissions**

Pure tests:

- 3/3 græn.

---

# 6. Sale transaction core

Kjarninn fyrir Sale/SaleLine/Payment var byggður með exact decimal arithmetic, ekki JavaScript floating-point.

Helstu reglur:

### Sale lifecycle

- `DRAFT -> HELD / FINALIZED / CANCELLED`
- `HELD -> DRAFT / FINALIZED / CANCELLED`
- `FINALIZED -> RETURNED`
- terminal states endurvakna ekki eldri stöður.

### SaleLine

Lína varðveitir snapshot af:

- description;
- quantity;
- unit;
- unitPrice;
- subtotal;
- discount;
- net;
- vatRate;
- vatAmount;
- total.

Line sources:

- `QUICK_BUTTON`
- `BARCODE`
- `SEARCH`
- `FREE_LINE`
- `WORK`
- `QUOTE`
- `ORDER`

### Payment

Greiðsla er sér record með eigin sequence og lifecycle.

Commit-röð:

- `dbf0cb5` – **Add sales transaction core**
- `4532f7d` – **Allow sales without terminal**
- `ec5ab2c` – **Complete sales branch relation**

Endanleg tenging:

```text
Company
 └─ SalesBranch (required)
      └─ SalesTerminal? (optional)
           └─ Sale
```

---

# 7. Service/repository-lag

Næst var transactional þjónustulag byggt ofan á kjarnann.

`SalesService` annast meðal annars:

- create draft sale;
- add/update/remove lines;
- hold/resume;
- record payment;
- payment transition;
- finalize sale;
- recalculation of totals.

Repository notar Prisma transactions með:

- `Serializable` isolation;
- retry á `P2034` og `P2002`;
- tenant-scoped reads og writes.

Mikilvæg regla:

> Authorization og entitlement eru caller-responsibility, en service/repository tekur alltaf `companyId` og scopes gögn aftur á gagnalaginu.

Commit:

`1bc0481` – **Add sales service layer**

Service tests:

- 7/7 græn.

---

# 8. Server action boundary

Client má ekki stjórna heimildum eða senda óstaðfest derived totals fyrir nýja free-line ferlið.

Action policy var skilgreint:

- create draft → `SALE_USE`;
- add/update/remove line → `SALE_USE`;
- hold/resume → `SALE_USE + SALE_HOLD`;
- record payment → `SALE_USE`;
- finalize → `SALE_USE`.

Jákvæður afsláttur krefst sér `SALE_DISCOUNT`.

`SALE_CHANGE_PRICE` var ekki tengt enn, þar sem canonical product price er ekki til í þessu fyrsta lagi.

Generic client-callable payment-status transition var viljandi ekki opnað. Payment confirmation á síðar að koma úr trusted payment flow.

Commit:

`bde7173` – **Add sales action permission boundary**

Action policy tests:

- 4/4 græn.

---

# 9. Checkpoint 3A – fyrsta raunverulega Sala-workspace

Fyrsta UI-lagið kom í stað prototype-síðunnar.

Nýtt:

- `/sala`
- `/sala/[id]`
- ný sala út frá branch;
- terminal valkvætt;
- listi yfir opnar `DRAFT/HELD` sölur;
- frjáls sölulína;
- exact VSK calculation á server-side;
- afsláttarheimild;
- hold/resume;
- finalize;
- tenant-safe read models;
- fjögurra tungumála textalag `is/en/pl/sr`.

Nýr pure helper reiknar:

- subtotal;
- net;
- VSK;
- total.

Mikilvæg takmörkun sem var meðvituð:

> Nákvæm gjaldmiðils-/kvittunarrúnnun og formleg skattareikningsregla er ekki enn fest; exact decimal helperinn er aðeins grunnur fyrir fyrsta Sala-workspace.

Commit:

`92dbb9b` – **Add first sales workspace**

Validation eftir 3A:

- domain 8/8;
- permissions 3/3;
- action policy 4/4;
- service 7/7;
- TypeScript hreint;
- `git diff --check` hreint.

---

# 10. Checkpoint 3B – Sala í Stjórnun

Næst var Sala tengd inn í sameiginlegt stjórnunarsvæði fyrirtækisins.

Ný síða:

`/stjornun/sala`

Þar er hægt að:

- velja virkan `OperationalLocation` og gefa honum söluhlutverk;
- virkja/óvirkja `SalesBranch`;
- stofna `SalesTerminal`;
- breyta terminal-kóða, heiti og tegund;
- virkja/óvirkja terminal.

Allar write-aðgerðir krefjast server-side:

`SALE_SETTINGS_MANAGE`

Terminal-kóði er normaliseraður deterministically og unique innan fyrirtækis.

Pure tests fyrir Sala-stillingar:

- deterministic normalization;
- trim/casing á heiti;
- empty/oversized rejection;
- fail-closed terminal type.

Commit:

`b42f4e9` – **Add sales branch and terminal management**

Loka regression eftir 3B:

- sales-domain 8/8;
- sales-permissions 3/3;
- sales-action-policy 4/4;
- sales-settings 4/4;
- sales-service 7/7;
- samtals **26/26 próf græn**;
- `tsc --noEmit` hreint;
- worktree hreint.

---

# 11. Migration-vinna – fyrst read-only

Sala-schemað var tilbúið í kóða en engin DB migration hafði verið keyrð fram að þessu.

Fyrsta `prisma migrate status` í Sala-worktree mistókst viljandi án raunverulegs `.env`:

- datasource féll á placeholder;
- `localhost:5432` var ekki aðgengilegt.

Staðfest var síðan að:

- `C:\GLÖGGT-SALA` hafði engar `.env*` skrár;
- `C:\GLÖGGT\.env` og `.env.local` voru til;
- `.env*` var réttilega git-ignored;
- `prisma.config.ts` les `DATABASE_URL` úr `.env`.

`DATABASE_URL` var því lesið tímabundið úr aðal-workspace inn í current PowerShell process, án þess að prenta strenginn eða skrifa leyndarmál í Sala-worktree.

Read-only `prisma migrate status` staðfesti:

- datasource: Supabase PostgreSQL;
- 75 migrations til staðar;
- database schema up to date fyrir þá sögu.

---

# 12. Live DB diff fann eldri drift – og var hafnað

Fyrsta SQL-preview var búið til með live datasource → current schema.

Það innihélt óviðkomandi drift:

- `Employee.updatedAt DROP DEFAULT`;
- `EmployeeCompensation.updatedAt DROP DEFAULT`;
- `EmployeeQualification.updatedAt DROP DEFAULT`;
- `WorkKey.updatedAt DROP DEFAULT`;
- nokkur eldri index-rename.

Ákvörðun:

> Sala migration má ekki „laga“ eldri schema drift í leiðinni.

Þetta preview var því **ekki notað** sem migration.

Einnig var staðfest að ekkert `SHADOW_DATABASE_URL` væri til.

---

# 13. Hreint schema-to-schema Sala migration

Rétta leiðin var að bera saman nákvæmlega:

- baseline schema úr commit `1579835`;
- núverandi Sala schema.

Fyrsta baseline-copy fór í gegnum PowerShell textameðhöndlun og gaf encoding-frávik á `ServiceTimeEntry` default (`ANNAÐ`). Það var stöðvað.

Baseline var síðan búið til **byte-for-byte** með `git show` og blob hash staðfestur áður en Prisma diff var keyrt.

Hreina SQL-previewið innihélt aðeins:

- 4 ný enum;
- 12 `canSale...` dálka á `UserCompany` með `DEFAULT false`;
- `CompanyGroup`;
- `CompanyGroupMembership`;
- `SalesBranch`;
- `SalesTerminal`;
- `Sale`;
- `SaleLine`;
- `Payment`;
- viðeigandi indexes;
- `OperationalLocation(id, companyId)` composite unique;
- tenant-safe foreign keys.

Engin:

- `DROP TABLE`;
- `DROP COLUMN`;
- rename;
- delete;
- truncate;
- Employee/WorkKey drift.

Migration-skrá:

`prisma/migrations/20261001232500_add_sales_foundation/migration.sql`

Lengd:

- 224 línur.

SHA256 preview og migration voru nákvæmlega eins:

`9D2854E8FA09C1CFD5C52B1A54308AD6A0C6181D7134BD55A43F187842409495`

Commit:

`01dac8b` – **Add sales foundation migration**

---

# 14. Production DB deploy

Fyrir deploy var `migrate status` keyrt aftur gegn raunverulegum Supabase gagnagrunni.

Staða:

- 76 migrations fundust;
- aðeins ein pending:

`20261001232500_add_sales_foundation`

Eftir production migration deploy var staðfest:

- **76 migrations found**;
- **Database schema is up to date!**

Þar með var Sala foundation komin í raunverulegan gagnagrunn.

`tsc --noEmit` var hreint og worktree áfram hreint.

---

# 15. Turbopack / worktree node_modules vandamál

Fyrsta dev-server tilraun á Sala-worktree lenti í Turbopack panic:

> `Symlink [project]/node_modules is invalid, it points out of the filesystem root`

Rannsókn sýndi:

```text
C:\GLÖGGT-SALA\node_modules
LinkType: Junction
Target: C:\GLÖGGT\node_modules
```

Þetta var gamall worktree-junction sem Turbopack 16.3.0 samþykkti ekki.

Tengillinn var fjarlægður án þess að eyða raunverulegu `C:\GLÖGGT\node_modules`.

Sala-worktree fékk síðan sjálfstætt dependency-umhverfi og Next.js var ræst á sér porti:

`http://localhost:3001`

Ástæðan fyrir porti 3001 var að gamli dev-serverinn úr `C:\GLÖGGT` var enn á porti 3000:

- PID 20636;
- command line vísaði á `C:\GLÖGGT\node_modules\next...`.

Þessi gamla keyrsla var ekki drepin; worktree-in voru keyrð hlið við hlið.

---

# 16. Entitlement próf – Sala þarf að vera virk í Admin

Fyrsta opnun `/stjornun/sala` virtist hoppa á `/`.

Eftir að réttur Sala-dev-server var kominn á port 3001 kom í ljós næsta rétta lag:

**Sala var ekki virk í áskrift fyrir virka fyrirtækið.**

Notandinn fór í Admin og virkjaði `Sala` fyrir fyrirtækið.

Þá birtist Sala rétt í Stjórnun og `/stjornun/sala` varð aðgengilegt.

Þetta staðfesti að entitlement-flæðið virkar:

```text
Admin virkjar þjónustu/einingu
→ Stjórnun sér stillingar þjónustunnar
→ notendaheimildir stýra hver má nota/stilla hana
```

---

# 17. Fyrsti raunverulegi sölustaður og terminal

Í `/stjornun/sala` var virkur rekstrarstaður gerður að sölustað:

**Vogar – þjónustusvæði**

Operational location code:

`LT_LOC_VOGAR`

Síðan var stofnuð sölustöð:

- kóði: `KASSI-01`;
- heiti: `Afgreiðsla`;
- tegund: `POS` / Kassi;
- virk: Já.

UI sýndi grænt staðfestingarskilaboð:

> Sölustillingar vistaðar.

Þetta staðfesti 3B gegn raunverulegum gögnum.

---

# 18. Smoke-test – Sala #1 án terminal

Fyrsta raunverulega salan var stofnuð án sölustöðvar.

### Sala #1

Sölustaður:

`Vogar – þjónustusvæði`

Sölustöð:

`Engin sölustöð`

Lína:

- lýsing: `Veitingar`;
- magn: 10;
- einingarverð án VSK: 10.000 ISK;
- afsláttur: 0;
- VSK: 24%;
- nettó: 100.000 ISK;
- VSK: 24.000 ISK;
- samtals: **124.000 ISK**.

Prófað var:

1. bæta línu við;
2. `Setja í bið`;
3. staða varð `Í bið`;
4. línur læstust;
5. `Halda áfram`;
6. sale opnaðist aftur;
7. `Ljúka sölu`;
8. staða varð `Lokið`;
9. línur voru áfram læstar;
10. gögn héldust eftir refresh.

Mikilvæg staðfesting:

> Sala má vera gild án terminal, eins og hönnunin gerði ráð fyrir.

---

# 19. Smoke-test – Sala #2 með KASSI-01

Önnur sala var síðan stofnuð með raunverulegri sölustöð.

### Sala #2

Sölustaður:

`Vogar – þjónustusvæði`

Sölustöð:

`Afgreiðsla` (`KASSI-01`)

Lína:

- lýsing: `Prufa tvítekt`;
- magn: 5;
- einingarverð án VSK: 5.000 ISK;
- afsláttur: 0;
- nettó: 25.000 ISK;
- VSK 24%: 6.000 ISK;
- samtals: **31.000 ISK**.

Salan var síðan lokuð.

Loka-skjár staðfesti:

- staða `Lokið`;
- sölustaður réttur;
- sölustöð `Afgreiðsla` rétt varðveitt;
- 25.000 nettó;
- 6.000 VSK;
- 31.000 samtals;
- línur læstar.

Þetta var síðasta lykilprófið á fyrsta Sala-áfanganum.

---

# 20. Endanleg commit-röð Sala dagsins

Branch:

`feature/sala-v1`

Commit-röð:

```text
01dac8b Add sales foundation migration
b42f4e9 Add sales branch and terminal management
92dbb9b Add first sales workspace
bde7173 Add sales action permission boundary
1bc0481 Add sales service layer
ec5ab2c Complete sales branch relation
4532f7d Allow sales without terminal
dbf0cb5 Add sales transaction core
8f1e5f8 Add sales user permissions
09f4a9a Add sales organization and terminal foundation
1579835 Add versioned document instance envelope state
```

Worktree var hreint við lok Sala-vinnunnar.

Ekki var staðfest í lok dags að branch hefði verið push-að eða merge-að í `main`, þannig að skýrslan fullyrðir það ekki.

---

# 21. Hvað er viljandi EKKI komið í Sölu enn

Þrátt fyrir mjög stóran fyrsta áfanga voru nokkur svið viljandi ekki tekin inn enn:

- payment checkout UI;
- confirmed payment provider flow;
- split payment UI;
- invoices;
- invoice numbering;
- credit notes;
- formal tax/VAT invoice compliance;
- customer model tenant-hardening;
- product catalog;
- barcode search;
- quick buttons;
- canonical product pricing;
- `SALE_CHANGE_PRICE` runtime enforcement;
- inventory movement;
- Work links;
- accounting facts/events;
- settlement/session/cash register flow;
- currency/receipt rounding policy.

Mikilvæg lokaákvörðun kvöldsins:

> Ekki byrja checkout/payment-lagið í nótt. Stöðva þegar foundation + management + migration + real DB smoke-test er orðið grænt.

---

# 22. Sala – staða við dagslok

Fyrsti Sala-áfanginn er staðfestur end-to-end:

- entitlement virkar;
- action-specific permissions virka;
- branch/terminal management virkar;
- Sale/SaleLine transaction core virkar;
- exact decimal calculation virkar á prófuðum dæmum;
- hold/resume virkar;
- finalize virkar;
- terminal optional virkar;
- terminal-specific sale virkar;
- tenant-safe composite relations eru í DB;
- migration er applied;
- 76 migrations eru up to date;
- browser smoke-test gegn raunverulegum DB er grænt.

Næsti eðlilegi Sala-áfangi síðar er **Payment/checkout**, en hann var viljandi ekki hafinn í kvöld.

---

# 23. Aðal-workspace: Astra sett af stað yfir nótt

Eftir að Sala var stöðvuð var ákveðið að nýta nóttina í verkefnið sem var enn opið frá 30. september í:

`C:\GLÖGGT`

Astra var sett af stað með afmarkað verkefni:

**Klára almenna duplicate-vörn fyrir endurtekin lánaskjöl / document instances.**

Canonical dæmi:

- Festa/Landsbankinn;
- `Innheimtubréf númer 338379`;
- lánatenging `0142-338379`;
- installment 16/480 og 17/480;
- sama obligation identity;
- mismunandi document instances.

Markmið Astra:

- byggja almenna lausn, ekki vendor-hardcode;
- halda obligation identity og document instance identity aðskildu;
- veikja ekki venjulega invoice duplicate-vörn;
- byggja ofan á núverandi `document-instance-*` vinnu;
- bæta pure/service regression tests;
- keyra `tsc` og `git diff --check`;
- gera lokaskýrslu;
- **ekki** framkvæma DB migration, `db push` eða production write;
- **ekki snerta `C:\GLÖGGT-SALA` eða `feature/sala-v1`**.

Við lok þessarar dagsskýrslu var Astra farin í gang en hafði ekki enn skilað niðurstöðu.

---

# 24. Varúðarreglur sem héldu allan daginn

## Worktree / Git

- aldrei `git add .` þegar óskyld vinna getur verið til staðar;
- ekki resetta/hreinsa aðal-workspace;
- Sala einangruð í sér worktree;
- migration sem sér checkpoint;
- engin merge í main áður en smoke-test væri grænt.

## Gagnagrunnur

- fyrst `migrate status`;
- live datasource diff notað aðeins sem diagnostic;
- drift ekki blandað inn í Sala migration;
- schema-to-schema diff fyrir hreint migration;
- hash-staðfesting áður en migration var commit-uð;
- production deploy aðeins eftir eina pending migration og hreint SQL;
- engin `db push`.

## Öryggi / tenant boundaries

- active company kemur úr request context, ekki client;
- permissions server-side;
- tenant scoping endurtekið í repository/relations;
- composite FKs notuð þar sem branch/terminal/sale þurfa sama company.

## i18n

Nýtt Sala UI byggt með:

- íslensku;
- ensku;
- pólsku;
- serbnesku á kyrillísku.

---

# 25. Prófa- og validation-staða dagsins

Loka regression fyrir Sala:

- sales-domain: **8/8**;
- sales-permissions: **3/3**;
- sales-action-policy: **4/4**;
- sales-settings: **4/4**;
- sales-service: **7/7**.

Samtals:

**26/26 relevant Sala-próf græn.**

Auk þess:

- `npx --no-install tsc --noEmit` – hreint;
- `git diff --check` – hreint;
- Prisma schema – valid;
- migration hash – exact match við yfirfarið preview;
- production DB – 76 migrations up to date;
- browser smoke-test – grænt.

---

# 26. Nákvæmur stoppunktur dagsins

## Sala-worktree

**Path:** `C:\GLÖGGT-SALA`  
**Branch:** `feature/sala-v1`  
**HEAD:** `01dac8b` – **Add sales foundation migration**

Staðfest í raunverulegum DB:

### SalesBranch

`Vogar – þjónustusvæði`

### SalesTerminal

- `KASSI-01`
- `Afgreiðsla`
- POS / Kassi
- virk

### Sale #1

- án terminal;
- Veitingar;
- 100.000 nettó;
- 24.000 VSK;
- 124.000 samtals;
- hold/resume/finalize prófað;
- lokið.

### Sale #2

- terminal: Afgreiðsla;
- 25.000 nettó;
- 6.000 VSK;
- 31.000 samtals;
- lokið.

## Aðal-workspace

**Path:** `C:\GLÖGGT`

Astra er í gangi yfir nótt við duplicate/document-instance verkefnið.

Engin niðurstaða frá Astra var komin við skýrslulok.

---

# 27. Fyrsta verk næstu lotu

Við næstu opnun þarf fyrst að velja hvaða þræði á að taka:

### A. Yfirfara Astra-niðurstöðu

Fyrsta forgangsverk að morgni:

1. lesa lokaskýrslu Astra;
2. skoða nákvæmlega hvaða skrár hún breytti í `C:\GLÖGGT`;
3. keyra/staðfesta tests;
4. ganga úr skugga um að engin Sala-skrá hafi verið snert;
5. yfirfara obligation-vs-document-instance regluna;
6. commit/deploy aðeins eftir mannlega yfirferð.

### B. Sala

Sala þarf ekki frekari vinnu strax. Þegar næsti Sala-áfangi hefst er eðlileg röð:

1. Payment/checkout boundary;
2. greiðslumátar;
3. trusted confirmation flow;
4. split payments;
5. settlement/session síðar;
6. invoice-lag eftir sérstaka compliance-rannsókn.

Ekki sameina PaymentStatus og SaleStatus.

---

# 28. Dagsniðurstaða

1. október var dagurinn þar sem **GLÖGGT Sala varð raunverulegur rekstrarkjarni í stað hugmyndar eða prototype**.

Það gerðist án þess að fórna helstu arkitektúrreglum GLÖGGT:

- sjálfstæðar einingar;
- Heim/Stjórnun sem control plane;
- tenant-safe gögn;
- explicit entitlement;
- action-specific permissions;
- deterministic core;
- server-side authorization;
- audit-ready separation milli sölu, greiðslu, reiknings og bókhalds;
- i18n frá fyrstu línu;
- litlir Git-checkpointar;
- migrations yfirfarnar áður en DB er snert.

Mikilvægasta tæknilega niðurstaðan er að Sala keyrði í fyrsta sinn allan veginn:

```text
Admin virkjar Sala
→ Stjórnun stofnar SalesBranch
→ Stjórnun stofnar SalesTerminal
→ /sala stofnar Sale
→ SaleLine reiknar exact subtotal/VSK/total
→ Hold
→ Resume
→ Finalize
→ gögn varðveitast í Supabase
```

Og það var prófað bæði:

- án terminal;
- með `KASSI-01 / Afgreiðsla`.

Dagurinn endaði með meðvitaðri stöðvun í stað þess að teygja Sölu strax yfir í checkout og reikningagerð.

Næturvinnan var síðan færð aftur yfir á næsta mikilvæga eldri gagnavandamál:

> **sama skuldbinding má framleiða mörg gild document instances án þess að þau verði ranglega flokkuð sem duplicate.**

Astra vinnur það verkefni áfram í einangruðu aðal-workspace yfir nótt.

**Loka-checkpoint Sala:** `01dac8b`  
**Production DB:** 76 migrations applied / schema up to date  
**Sala smoke-test:** grænt  
**Næturverk:** Astra – duplicate/document-instance vörn í `C:\GLÖGGT`  
**Næsti morgunpunktur:** yfirfara Astra áður en nokkuð er commit-að/deploy-að úr þeirri vinnu.
