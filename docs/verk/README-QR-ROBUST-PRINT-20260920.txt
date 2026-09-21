GLÖGGT – QR prentun, robust isolation fix – 20.09.2026

Markmið
- Hætta að neyða Chrome í örsmáa @page pappírsstærð þegar verið er að prófa á A4-prentara.
- Prenta eitt sjálfstætt merkiskjal með nákvæmum raunmálum merkisins inni á einni prentsíðu.
- Forðast að app-layout/Tailwind/DOM-flæði geti klofið texta og QR á tvær síður.

Breyting
- PrintQrButton býr nú til einangrað iframe-prentskjal með eingöngu merkinu.
- Ekki er lengur sett @page size á 1,5 × 0,8 cm o.s.frv.; printer/media stjórnar pappírsstærð.
- Merkið sjálft heldur cm-stærðinni, t.d. 1,5 × 0,8 cm.
- Compact layout er endurteiknað með einföldu inline CSS án app-stíla.
- Full layout prentar heiti/tegund/kóða/QR sem eitt órofið merki.

Prófun
- Á A4: merkið á að sjást eitt og óklofið á einni síðu, yfirleitt efst vinstra megin.
- Á límmiðaprentara: veldu rétt media/paper size í printer driver og prentaðu við 100% / Default scale.
- Headers and footers skulu vera slökkt fyrir hreina límmiðaprentun.
