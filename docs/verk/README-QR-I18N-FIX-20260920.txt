GLÖGGT – QR prentun og Mobile tungumál, lagfæring 20.09.2026

1. QR prentun
- Prenthnappurinn býr nú til sérstaka prent-klónu beint undir body.
- Öll önnur UI-element eru falin í prentun þannig að app-layout getur ekki myndað auðar aukasíður.
- Merkið er prentað sem ein föst eining með raunbreidd/raunhæð í cm.
- @page heldur áfram að óska eftir sömu stærð fyrir límmiðaprentara.
- Ef almennur A4-prentari styður ekki 15x8 mm media á hann samt að sýna eitt blað með litla merkinu efst, en ekki tvær auðar síður.
- Chrome headers/footers eru vafrastilling og þarf enn að slökkva á þeim þegar límmiðaprentari er notaður.

2. Tungumál í Mobile/Verk
- Persónulegt UserSettings.interfaceLanguage fær nú forgang yfir Employee.preferredLanguage í Mobile Verk.
- Sama forgangsröð er notuð fyrir forgangs-push tilkynningar.
- Employee.preferredLanguage helst sem fallback ef persónuleg viðmótsstilling er ekki til.

Ástæða:
QR-síðan las UserSettings beint og gat því verið á ensku á sama tíma og Mobile Verk las Employee.preferredLanguage fyrst og var áfram íslenskt. Þetta gaf ósamræmt viðmót og gat litið út eins og aðeins Chrome-þýðing virkaði.
