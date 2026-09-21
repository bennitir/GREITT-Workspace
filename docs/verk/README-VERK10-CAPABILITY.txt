GLÖGGT – Verk 10 capability-próf
18.09.2026

Markmið
- Halda Verk-kjarnanum almennum.
- Vinnuvélar eru valkvæð fyrirtækjavirkni, ekki harðkóðaður alheimshluti.
- Gera ráð fyrir fleiri atvinnugreinasértækum capabilities síðar.

Hvað breytist
1. Stjórnstöð > Fyrirtæki > [fyrirtæki]
   - Nýr kafli: "Verk – virkni".
   - Fyrsti valkostur: Vinnuvélar.

2. /verk10
   - Les capability-stillinguna fyrir virka fyrirtækið.
   - Ef Vinnuvélar er óvirkt hverfa:
     * Vinnuvélar-flipinn,
     * Vélar í vinstra auðlindavali,
     * Vélar í hægra Verk-spjaldi,
     * Vinnuvélar-spjaldið neðst,
     * Vélar tengdar í Stöðu dagsins.
   - Ef kveikt er á Vinnuvélum birtast þessi svæði aftur.

Gagnagrunnur
- Engin Prisma migration.
- Núverandi CompanyModule tafla er nýtt tímabundið sem geymsla með storage-id:
  verk:machines
- Þetta leyfir reynsluakstur áður en við ákveðum hvort capabilities eigi síðar sér töflu.

Öryggi
- Gamla /verk er ósnert.
- Verk 10 er áfram les-only gagnvart nýja domain-kjarnanum.

Próf
1. Losa ZIP beint í C:\GLÖGGT
2. npx tsc --noEmit
3. Opna fyrirtækið í Stjórnstöð og finna "Verk – virkni".
4. Prófa Vinnuvélar Óvirkt/Virkt.
5. Opna /verk10 eftir hvora breytingu og staðfesta að viðmótið fylgi stillingunni.
