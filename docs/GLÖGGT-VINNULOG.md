# GLÖGGT – vinnudagbók

Þessi skrá varðveitir þróunarsögu GLÖGGT.

Markmiðið er að skrá:
- hvað var unnið
- hvað var prófað
- hvað tókst
- hvað mistókst
- mikilvægar hönnunar- og kerfisákvarðanir
- Git commit og deployment
- ólokin verkefni
- nákvæman stoppunkt fyrir næstu vinnulotu

## Reglur

1. Nýjasta vinnulota fer efst.
2. Ekki breyta eldri niðurstöðum til að láta þær passa við nýja stöðu.
3. Ef fyrri ákvörðun breytist skal skrá nýja ákvörðun og vísa í þá eldri.
4. Aðeins staðfest próf skulu merkt sem staðfest.
5. Commit-hash og production-staða skulu skráð þegar við á.
6. Aldrei skrá lykilorð, API-lykla eða önnur leyndarmál.
7. Vinnudagbókin er þróunarsaga — ekki staðgengill fyrir Git.

---

## 2026-09-12

### Upphaf dags

Haldið áfram eftir vinnulotu 11.–12. september.

Staða við upphaf:
- Fjöltyngt GLÖGGT-viðmótslag komið upp.
- Full viðmótstungumál: íslenska, enska, pólska og serbneska.
- Innsýn staðfest fjöltyngd.
- Þjónustutímakerfi komið með grunn fyrir sjálfvirka og handvirka skráningu.
- Valin þjónustutímastilling: AUTO_PROMPT með 10 mínútna idle-mörkum.
- Commit `fed4e6c` komið í production.
- Vercel production staðfest Ready.

### Verk dagsins

- [ ] Stofna varanlega vinnudagbók í GLÖGGT-repo.
- [ ] Setja eldri lykiláfanga inn í dagbókina.
- [ ] Útfæra idle-spurningu þjónustutímakerfis.
- [ ] Prófa breytingar.
- [ ] Commit / deploy eftir því sem við á.

### Næsti tæknilegi punktur

Þjónustutímakerfið þarf að spyrja notanda þegar hann kemur aftur eftir óvirkni hvort óvirki tíminn eigi að teljast með í þjónustutíma.

---

# Eldri lykiláfangar

## 2026-09-11 → 2026-09-12

### Fjöltyngt GLÖGGT

- Lokið við kerfisbundna fjöltyngingu á GLÖGGT.
- Full viðmótstungumál:
  - íslenska
  - enska
  - pólska
  - serbneska
- UI-tungumál og tungumál efnis/AI eru aðskilin hugtök.
- Reikningsnúmer eru tungumálaóháð. Dæmi: `4400` helst alltaf `4400`.
- Stöðluð heiti mega þýðast en sérsniðin notendaheiti ekki sjálfkrafa.
- Innsýn var prófuð í röð:
  - íslenska
  - enska
  - pólska
  - serbneska
- Fjöltyngd Innsýn staðfest virk.

### Þjónustutími

- Grunnur lagður að þjónustutímaskráningu fyrir bókara/notanda.
- Þjónustutími er aðskilinn frá WorkLog / Vinnustund starfsmanna.
- Kerfið getur tengt tíma við valið fyrirtæki og verkhluta.
- Stuðningur við handvirka og sjálfvirka tímaskráningu.
- Tímagögn styðja sekúndur.
- Valin prófunarstilling:
  - `AUTO_PROMPT`
  - idle-mörk: 10 mínútur
- Ólokið:
  - spurning þegar notandi kemur aftur eftir idle um hvort óvirki tíminn eigi að teljast með.

### Git / production

- Commit:
  - `fed4e6c` — `Add multilingual UI, workflow settings and service tracking`
- Umfang:
  - 48 files changed
  - 3500 insertions
  - 1453 deletions
- `npx tsc --noEmit`:
  - 0 villur
- `npx prisma validate`:
  - staðfest
- `npx prisma migrate deploy`:
  - engar pending migrations
- Vercel Production:
  - Ready
- Production smoke test:
  - staðfest

---

## 2026-09-10

### Learned booking patterns

Stór áfangi í því að láta GLÖGGT læra af staðfestum bókunum án þess að hardkóða niðurstöður.

Staðfest dæmi:
- HS lærði leiðréttan mótreikning `1510`.
- Ergo lán `104907` hélt staðfestum skuldalykli `2220`.
- Sjóvá fjölskírteini varð jafnvægisbókun með sundurliðun.
- Sjóvá tilboð `851.853` var áfram Innsýn / non-bookable.
- TR og Sýslumaður zero-net skjöl urðu bókanleg án þess að undirliðir töpuðust.
- Endurgreiðsla bifreiðagjalds var leiðrétting á `4740` en ekki ný tekjufærsla.

Commit:
- `f6cb697`

Production:
- push á `main`
- Vercel Ready
- innskráning prófuð
- Fylgiskjöl prófuð

---

## 2026-09-09

### Sjóvá fjölskírteini

- Fjölskírteina greiðslukvittun var normalíseruð í sjálfstæð tryggingaskírteini í UI.
- Ekki lengur eitt sameinað trygginga-entity.
- Kerfið getur greint mismunandi tryggingategundir innan sama skjals.
- Dæmi:
  - fjölskylduvernd
  - lögboðin ökutækjatrygging
  - brunatrygging húseigna
- Bókunartillögur tengdar viðeigandi kostnaðarreikningum.
- Ákvörðun tekin um að vinna ekki frekar í tilteknu Sjóvá-skjalinu fyrr en frekari yfirferð færi fram.

---

## 2026-09-07 → 2026-09-08

### Innsýn og skjalavinnsla

- Bætt pension-payer detection í Innsýn.
- Commit:
  - `a4a8d51`
- Receipt processing flutt yfir í Supabase Storage.
- Commit:
  - `9ca6276`
- `createInsightJobForDocument` sett upp.
- Insight processing version:
  - `innsyn-v1`
- Persistent Insight job-vinnsla styrkt.
- Stale recovery bætt aftur inn síðar með:
  - `60ed275`

### Kennitala

- Grunnur að `lib/core/kennitala.ts`.
- Markmið:
  - staðfesta form
  - verja gegn ómögulegum dagsetningum
  - halda reglunum miðlægum

### Vinnulag

- Core-hönnun GLÖGGT skal áfram unnin í sameiginlegri umræðu.
- Önnur AI-tól aðeins fyrir afmörkuð verkefni.
- Mikilvægar hönnunarniðurstöður skulu varðveittar jafnóðum.

---

## 2026-09-04

### Insight worker

- Stale recovery endurheimt í Insight worker.
- Commit:
  - `60ed275`
- `npx tsc --noEmit` staðfest án villu.

### Innsýn – batch-regla

Ákvörðun:
- Bunkavinnsla má ekki vera háð því að notandi haldi sömu vafrasíðu opinni.
- Batch/job þarf að vera:
  - server-bundið
  - persistent
  - endurheimtanlegt
  - sjálfstætt fyrir hvert skjal

---

## 2026-09-03

### Lán og skuldareikningar

Hönnunarregla:

Þegar AI greinir nýtt lán eða lánsnúmer:
- má AI leggja til sérstakan skuldareikning
- má AI ekki stofna reikning sjálft
- notandi/bókari samþykkir stofnun
- varðveita skal tengingu:
  - lánveitandi
  - lánsnúmer
  - skuldareikningur

---

## 2026-09-01 → 2026-09-02

### VSK og reikningslyklar

- VSK-reglur styrktar.
- Account number + account name þurfa bæði að passa GLÖGGT-standard áður en default VSK-regla er notuð.
- Markmið:
  - verja imported / legacy chart of accounts
  - forðast ranga sjálfvirka VSK-flokkun

VSK-flokkar þróaðir í átt að:
- INPUT
- OUTPUT
- NONE
- EXEMPT
- REVIEW
- SYSTEM

Regla:
- öruggar tillögur mega fara í quick-approve
- REVIEW og SYSTEM mega ekki fara sjálfkrafa í gegn

### Fyrirtækjaskrá / RSK

Áður en GLÖGGT fer í almenna SaaS-notkun með mörgum viðskiptavinum:
- senda Skattinum skriflega fyrirspurn
- fá staðfestingu á fyrirhugaðri notkun Fyrirtækjaskrá API

---

## 2026-08-30 → 2026-08-31

### Mobile / PWA / aðgangur

- Mobile sett undir innskráningu.
- Óinnskráður notandi á `/mobile` fer á:
  - `/innskraning?next=%2Fmobile`
- PWA-virkni styrkt.
- Mobile ætlað að virka app-líkt á heimaskjá.
- Aðgangspóstur á að innihalda:
  - leið í GLÖGGT á tölvu
  - leið í GLÖGGT Mobile
  - stutta skýringu á uppsetningu Mobile sem app

### Verk

- WorkOrder og WorkLog þróað.
- CLIENT á ekki að geta stofnað ný verk.
- Vinnutímar:
  - 24 tíma snið
  - `HH:mm`

---

## 2026-08-28

### Öryggi og rekjanleiki

Ákvörðun:
- rekjanleiki á að vera kerfislægur eiginleiki í GLÖGGT
- ekki eingöngu tengdur VSK

Færslur eiga að varðveita eftir því sem við á:
- uppruna
- hver stofnaði / bókaði
- tímasetningar
- breytingar
- overrides
- ástæður mikilvægra sjálfvirkra ákvarðana

Hugmynd:
- sérstakur flipi/panel:
  - `Rekjanleiki`

---

## 2026-08-25 → 2026-08-27

### Banki

- Grunnur lagður að Banka-einingu.
- Módel:
  - Company
  - BankAccount
  - BankTransaction
- Síður:
  - `/banki`
  - `/banki/tengja`

Öryggisregla:
- aldrei nota `prisma migrate reset` á núverandi gagnagrunni til að leysa migration-vandamál.

### Framtíð – Afstemming

Afstemming verður sér Banki-undireining.

Hugsanleg staða bankafærslu:
- match
- review
- no match

Kerfið þarf einnig að geta fundið:
- bókaða GLÖGGT-færslu sem vantar samsvarandi bankahreyfingu.

---