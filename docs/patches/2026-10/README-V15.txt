GLÖGGT V15 — exact date + amount search-first fyrir kortaafstemmingu

Markmið:
- nota raunlistana úr Skjalasafni + Gullkorti;
- leita fyrst eftir exact dagsetningu + absolute upphæð, ekki merchant-stringi;
- sýna UNIQUE_POSSIBLE þegar eitt hæft skjal passar exact á dagsetningu/upphæð en canonical merchant/alias er enn óstaðfest;
- halda fleiri exact mótum AMBIGUOUS/fail-closed;
- halda PRIMARY FinancialEvent ownership óbreyttu;
- legacy/pre-statement counteraccount (t.d. 1510 vs 2230) er ekki matching blocker.

Engin Prisma migration.
