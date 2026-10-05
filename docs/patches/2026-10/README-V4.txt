GLÖGGT KORTAAFSTEMMING V4 - FLAT OVERLAY
2026-10-05

MIKILVÆGT:
Þessi ZIP er flat overlay fyrir C:\GLÖGGT.
Ef ZIP er afþjappað beint í C:\GLÖGGT eiga app/, lib/ og docs/ að lenda beint þar.
Það er ENGIN root/ millimappa í þessum pakka.

Inniheldur sameinað:
- PaymentCardTransaction -> reviewed AiDetectedDocument reconciliation
- canonical AiDetectedDocument sem matching-eining (Receipt aðeins gámur)
- undirskjals-síða/document-id í ambiguous UI
- exact-date dominance: exact-date kandidat blokkaður ekki af sama merchant/amount síðar innan 30 daga
- confirmation, audit og learning
- i18n texta

Staðfesting eftir yfirlagningu:
  git diff -- app/banki/kort/[id]/page.tsx lib/financial-reconciliation/card-reviewed-document-provider.ts

Í page.tsx á að sjást textinn sourcePage/detectedDocument í ambiguous rendering.
Í provider.ts á að sjást cardsWithExactDate og documentsWithExactDate.
