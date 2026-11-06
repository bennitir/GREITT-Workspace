# GLÖGGT — lagfæring á Supabase pooler-viðurkenningu

**Dagsetning:** 6. nóvember 2026
**Grunnútgáfa:** `779301a` (`utgafa/samstaeda-greining-20261106`)
**Markútgáfa:** `utgafa/samstaeda-pooler-20261106`

## Hvers vegna

Á gloggt.is er bankafærsla #329 (−901 kr.) og fylgiskjal #328 (901 kr.) til samanburðar, en `Afstemma` er læst. Greiningarútgáfa gaf `PRODUCTION_DATABASE_CONNECTION_NOT_APPROVED`. Þetta segir að skilyrði um tengisnið standast ekki, **ekki** sjálfkrafa að tengingin sé biluð. Orsökin hefur ekki verið sannreynd án leyndargilda.

Kóðinn samþykkti aðeins eitt fasta Supabase pooler-heiti: `aws-0-eu-west-1.pooler.supabase.com`. Supabase skilgreinir staðlað snið `aws-[INDEX]-[REGION].pooler.supabase.com`; bæði vísir og svæði geta verið önnur. Heimild: https://supabase.com/docs/guides/database/connecting-to-postgres

## Breytingar

- Samþykkir *strangt afmörkuð* `aws-[n]-[svæði].pooler.supabase.com` hýsilnöfn á 5432 eða 6543; engar óskyldar lénaslóðir, undirslóðir eða breytt hlutverk.
- Sama raunverkefnisauðkenni, rétt `postgres.[project-ref]` notandanafn, `postgres` gagnagrunnur, TLS (`sslmode=require`, `verify-ca` eða `verify-full`), og afmörkun `8:2` gilda áfram. Beint samband við `db.[project-ref].supabase.co:5432` helst óbreytt.
- Ef eitthvað annað hindrar vistun sýnir greiningin nú **eingöngu öruggt ástæðuauðkenni** (TLS vantar, röng gagnagrunnsheiti, hlutverk, hýsill/gátt); hvorki lykilorð né full tengislóð birtast.
- Engin migration, gagnabreyting eða sjálfvirk bókun.

## Prófanir

`node --test scripts/visual-document-set.test.cjs`: **10/10 PASS** í aðskildum sandkassa án gagnagrunns. Prófaði meðal annars breytilegt svæði og vísi, ranga leigjandaauðkenningu, rangt lén og vantaða TLS-kröfu. Full Next.js/TypeScript bygging fer fram með óvirkum tengingum í hreinu útgáfumöppunni hjá notanda fyrir GitHub-sendingu.

## Innsetning

Afþjappað undir `C:\GLÖGGT` með möppuskipan og keyrt:

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\GLÖGGT\docs\afhending\scripts\2026-11-06-UTGAFA-AFSTEMMA-POOLER.ps1"`

Skriftan krefst grunncommits `779301a` og hreinnar útgáfumöppu `C:\GLOGGT-LESUTGAFA`; hún kopíerar aðeins fjórar tilgreindar skrár, prófar, byggir með ógildum tengigildum og ýtir grein á GitHub *aðeins ef allt stenst*.

## Production

Engar Vercel-stillingar þarf að breyta fyrir þessa útgáfu. Þegar nýjasti kóði er síðar birtur í Production geta áður skráðir virkjunarrofar leyft **raunveruleg skrif** á reikningi #2 hjá fyrirtæki #8, ef allar varnir standast. Staðfesta verður fyrst rétta frumskjalið og bankafærsluna áður en smellt er á `Afstemma`. Ef læsing stendur enn birtist nýtt öruggt ástæðuauðkenni. Ekki slaka á SSL eða tenant-staðfestingu til að fá grænan hnapp.

Bakgrunnur: Afrit Supabase public schema frá 06.11.2026 kl. 09:15 er staðsett í `C:\Users\benni\AppData\Local\GLOGGT-DB-AFRIT\GLOGGT-public-20261106-091453.dump`. Það er afrit af public schema, ekki fullur endurheimtarprófaður gagnagrunnur.
