GLÖGGT — Mixed-use card language type fix V8 — 2026-10-05

Lagfæring:
- Normaliserar UserSettings.interfaceLanguage í gilt UiLanguage: is | en | pl | sr.
- Óþekkt/gamalt/tómt gildi fellur fail-safe í "is".
- Engin reconciliation-hegðun breytist.
- Engin Prisma migration þarf.

Eftir overlay yfir C:\GLÖGGT:
  npx tsc --noEmit

Síðan má keyra sama 44-prófa pakka aftur ef óskað er.
