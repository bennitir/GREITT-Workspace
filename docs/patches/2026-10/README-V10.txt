GLÖGGT – kortaflokkun: varanlegt val + fastur aðgerðaborði (V10, 2026-10-05)

Tilgangur
- Koma í veg fyrir að notandi eyði löngum tíma í að haka við færslur og missi valið.
- Sýna aðgerðir alltaf þegar eitthvað er valið, óháð því hvar notandi er staddur í löngum lista.

Breytingar
- Nýr CardBulkClassificationManager client component.
- Valið er varðveitt í sessionStorage per kort + filter og endurheimt eftir refresh/re-render ef færslurnar eru enn sýnilegar.
- Fastur action-bar neðst á skjánum birtist strax þegar 1+ færslur eru valdar.
- Action-bar sýnir fjölda valinna færslna og allar bulk-aðgerðir.
- „Velja allar sýnilegar“ og „Hreinsa val“ bætt við.
- Ef bulk-vistun mistekst helst valið óbreytt svo vinna tapist ekki.
- Eftir heppnaða vistun er val hreinsað.
- Engin Prisma migration.

Öryggi
- Engin sjálfvirk flokkun er framkvæmd.
- Persónulegt er áfram aðeins í boði þegar mixed-use policy leyfir það.
- Frumkortafærslur eru ekki eyddar eða breyttar.
