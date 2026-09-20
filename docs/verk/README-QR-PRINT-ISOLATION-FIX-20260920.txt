GLÖGGT – QR print isolation fix – 20. september 2026

Ástæða:
Fyrri window.print()/DOM-clone leiðin gat fallið aftur í venjulegt app-layout í Chrome print preview. Þá birtist fulla upplýsingamerkið eða stór QR-kóði á A4 í stað 1,5 × 0,8 cm compact merkis.

Breyting:
- Prentun fer nú í einangrað hidden iframe-document sem inniheldur aðeins eitt QR-merki.
- Valin layout-staða (full/row/column) er fest beint á prentklónið, ekki aðeins með CSS-breytum.
- QR-stærð er fest beint í cm á prentklónið.
- Merkið fær nákvæma width/height í cm og break-inside vörn.
- Núverandi app-síða er ekki lengur sjálf prentuð.

Athugið:
Ef valinn prentari styður ekki sérsniðna 1,5 × 0,8 cm pappírsstærð getur Chrome enn sýnt A4 sem blað, en merkið sjálft á þá að vera 1,5 × 0,8 cm efst vinstra megin og ekki breytast í fulla/risastóra útgáfu.
Chrome Headers and footers þarf áfram að slökkva á í More settings ef dagsetning/URL birtast.
