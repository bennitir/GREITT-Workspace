GLÖGGT – Verkflæði: staða, röð og háðir Verkþættir
Dagsetning: 19.09.2026

Markmið
------
Þessi lota gerir varanlega WorkPart-kjarnann að virkri vinnustýringu í stað
þess að vera aðeins les-/skráningarlag. Engin ný migration er nauðsynleg;
WorkPartDependency og sequence voru þegar komin í gagnalíkanið.

Helstu breytingar
-----------------
1. Staða Verkþáttar er nú breytanleg í canonical /verk/[id] sýn.
   Leyfilegar stöður: PLANNED, READY, IN_PROGRESS, ON_HOLD, BLOCKED,
   COMPLETED og CANCELLED.

2. FINISH_TO_START dependency er virk regla.
   Verkþáttur sem á ólokinn undanfara má ekki verða READY, IN_PROGRESS eða
   COMPLETED. COMPLETED og CANCELLED teljast lokastöður undanfara.

3. Dependency-grafið ver sig gegn hringtengingum.
   Ný tenging er hafnað ef hún myndi mynda leið aftur að upphafspunkti.

4. Dependencies eru stjórnanlegar úr UI:
   - velja undanfara,
   - sjá hvort hann er uppfylltur eða ólokinn,
   - fjarlægja tengingu,
   - sjá hversu marga eftirfarandi þætti hver þáttur opnar fyrir.

5. Röð Verkþátta er breytanleg með Upp/Niður.
   sequence er aðeins framsetningarröð. Hún endurskrifar ekki dependency-grafið.

6. WorkOrder yfirlitsstaða er samstillt út frá WorkPart-stöðum.
   - startedAt fæst þegar framkvæmd hefur sannanlega hafist,
   - completedAt fæst þegar allir hlutar eru terminal og niðurstaðan er COMPLETED,
   - ef lokaður Verkþáttur er enduropnaður hreinsast completedAt,
   - ef einn hluti er COMPLETED en aðrir eru enn PLANNED telst Verkið IN_PROGRESS,
     ekki DRAFT.

7. Rekjanleiki:
   STATUS_CHANGED, REORDERED og breytingar á dependencies fara í AuditEvent.

8. /verk er eina canonical Verk-sýnin.
   Gamlar /verk10 og /verk10/[id] slóðir redirecta yfir á /verk svo tvær
   samhliða útgáfur af sama domain-flæði myndist ekki.

Fjöltyngi
---------
Nýir UI-textar eru í work10 tungumálalaginu fyrir is/en/pl/sr. Enginn nýr
notendasýnilegur workflow-texti er harðkóðaður í page logic.

Öryggisreglur
-------------
- Ekki má tengja Verkþátt við sjálfan sig.
- Ekki má mynda dependency-hring.
- Ekki má hefja/loka successor með óloknum undanfara.
- Röð og dependency eru aðskilin hugtök.
- Staðreyndir um vinnu/efni breytast ekki við stöðubreytingu.
- Lokið Verk má enduropnast með stöðubreytingu Verkþáttar; eldri staðreyndir
  eru ekki endurskrifaðar.

Prófun eftir afritun
--------------------
npx tsc --noEmit

Raunpróf:
1. Opna Verk með minnst tveimur varanlegum Verkþáttum.
2. Tengja þátt 1 sem undanfara þáttar 2.
3. Reyna að setja þátt 2 í IN_PROGRESS áður en 1 er lokið -> á að hafna.
4. Setja þátt 1 í COMPLETED.
5. Setja þátt 2 í READY/IN_PROGRESS -> á að ganga.
6. Prófa Upp/Niður og staðfesta að dependency haldist óbreytt.
7. Reyna að mynda hring (2 -> 1 þegar 1 -> 2 er til) -> á að hafna.
8. Ljúka öllum opnum þáttum -> Verkið á að verða COMPLETED.
9. Enduropna einn þátt -> Verkið á að verða virkt aftur og completedAt hreinsast.
