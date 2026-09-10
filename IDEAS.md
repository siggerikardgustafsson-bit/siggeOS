# IDEAS — föreslaget men inte byggt (natt-session 2026-09-09 → 10)

Detta är spår B: visuella val, produktbeslut och sånt som kräver att du ser/
känner på det innan det byggs. Inget här är rört i koden.

För varje idé: **Vad · Varför (givet visionen) · Omfattning · Beslut du behöver
fatta först.**

Prioritetsgissning: 🔥 hög värde/låg risk · ⭐ värd att överväga · 💭 spekulativ.

---

<!-- Ny idé läggs i relevant domän-sektion. -->

## Jarvis / insikter

### 💭 Jarvis "veckoplan"-läge
Nattens jobb gjorde Jarvis coaching-metod vassare och gav den mönster + mål.
Nästa steg vore ett läge där Jarvis, på söndag, väger ihop kommande veckas
kalender (tentor, PA-pass, obligatoriska), aktiva mål och senaste mönster till
en konkret veckoplan ("3 pass, tyngdpunkt tis+lör pga PA ons-fre; 6h djupplugg
för mikrobiologi; lägg 2000kr mot Asien-buffern"). **Omfattning:** medel — ny
Jarvis-"mode" + prompt + ev. sparad plan-tabell. **Beslut:** vill du att Jarvis
ska vara proaktiv (pusha en plan) eller bara svara när du frågar? Var bor planen
— egen vy, dashboard-kort, eller bara i chatten?

## Dashboard / navigation / vyer

### ✅ MESTA BYGGT — UI för strukturerade mål (alt. c + d + a)
**Byggt:** `<GoalsSection>` på /traning, /ekonomi, /profil (#12) + live-metrics
(#13, 21 st) + **egen sida `/mal`** med domänfilter & sammanfattning (#18) +
**pin-knapp** (#18, sorterar pinnade först).
**Fortfarande öppet (dina beslut):**
- **(b) dashboard-kort** för pinnade mål — inte byggt (trängs med
  konstellationen). `TodayWidget` blickar nu framåt (#17) men visar inte mål.
  Alternativ: egen liten "Mål"-orb i Karta-vyn, eller en rad i Träd-vyn.
- Livsmålen (1/3/10 år) — se egen IDEAS-post nedan ("Fritext-livsmålen").

### ⭐ Auto-progress: override + nattjobb
`goalMetrics.js` täcker nu 21 metrics (vikt, fett, sömn, steg, bänk/knäböj/
marklyft-PR, 1k/5k/10k/halvmara-tid, pass 7d/28d, studietimmar 7d/28d,
nettoförmögenhet, netto/inkomst/sparkvot denna månad, CSN-fribelopp/termin) —
WORKLOG #13 la de fyra sista + tid-formatering.
Kvar: (1) fler metrics om du vill (specifik övning efter namn kräver att man
väljer övning i formuläret); (2) manuellt satt `current_value` vinner idag bara
om `metric` är tomt — ingen "override trots metric"; (3) värdena räknas ut vid
sidladdning; ett nattjobb som snapshotar dem vore grunden för en
progress-över-tid-graf per mål.
**Beslut:** vill du ha history-snapshots (kräver en `goal_progress`-tabell)?

## Domän-specifikt (träning, hälsa, ekonomi, plugg, resor, jobb)

### 🔥 Resmål ↔ sparande (ekonomi↔resmål, uttryckligt i visionen)
`trips` har `budget_sek` men ingen känsla av "hur nära jag är att ha råd".
F1-mål-tabellen har redan `linked_trip_id` — mekaniken finns, UX:en saknas.
Idé: på en resa i planeringsläge, visa en progress-rad "23 400 / 42 000 kr
sparat" där "sparat" kommer från antingen (a) ett kopplat sparmål, (b) en
manuell "avsatt hittills"-siffra, eller (c) en andel av net worth öronmärkt.
Jarvis skulle då kunna säga "Asienresan är 3 månader bort och du ligger 8 000
efter takten — lägg 2 700/mån till."
**Omfattning:** medel. **Beslut:** vilken sparkälla (a/b/c), och var progress-
raden bor (resekortet, en ny "ekonomi för resor"-vy, eller dashboarden).

### ✅ Rate limiting på health-ingest — BYGGT
30s per-token 429-spärr (WORKLOG #11). Kvar av din säkerhetsgranskning:
klartext-token (hasha), generisk 500 istället för rått PG-fel, semantisk
datumvalidering, och revoke-UI (nedan).

### 🔥 Setup-skärm för Apple Health-Shortcut (F3 backend är byggt)
`health-ingest`-endpointen + token-hantering finns (`src/lib/healthIngest.js`).
Kvar: en skärm (troligen i Inställningar → "Anslut Apple Health") som:
- genererar token vid första besöket (`getOrCreateIngestToken`)
- visar endpoint + token att klistra in, med copy-knapp
- steg-för-steg för Shortcut:en ("Get Contents of URL", POST, headers, body med
  `Health`-actions för vikt/sömn/steg/vilopuls)
- "Rotera token" (revoke) och "Stäng av"
- ev. "senast mottaget"-tid (kräver en `last_ingest_at`-kolumn — inte byggd)
**Omfattning:** liten–medel. Mest copy/instruktioner. **Beslut:** var bor den
(egen sida vs Inställningar-sektion), och vill du att jag skriver en färdig
`.shortcut`-fil att importera eller räcker textinstruktioner?

### ⭐ HRV / aktiv energi i health_logs
`health_logs` saknar kolumner för HRV och aktiv energi (kcal) — två av de mest
värdefulla Apple Health-signalerna (HRV ↔ återhämtning ↔ träningsberedskap).
**Omfattning:** liten migration + fält i Hälsa-formuläret + i `health-ingest`
FIELD_BOUNDS + i correlate.js (HRV↔träning/sömn vore en stark koppling).
**Beslut:** vill du ha in dem? Payoff är hög för träning-mot-anestesi-visionen
(återhämtning under tunga PA-veckor).

## Datamodell / arkitektur

### 🔥 Fritext-livsmålen → strukturerade mål, eller redigerbara av Jarvis
`user_settings.goals.one_year / three_year / ten_year / monthly_income_goal /
target_weight` är fritext i Profil. Jarvis *läser* dem (systemprompten) men har
ingen action för att ändra dem, och de syns inte i `<GoalsSection>`. Säger du
"mitt 1-årsmål är X" till Jarvis kan hen spara det som en *insikt* men inte
uppdatera själva livsmålsfältet. Två vägar: (a) en `update_life_goal`-action som
`patchGoals`:ar rätt nyckel (merge-säkert, litet); (b) migrera in dem som rader i
`goals`-tabellen med en egen kategori och sluta använda fritextfälten.
**Beslut:** vill du ha kvar 1/3/10-års-fritexten som egen grej i Profil, eller
ska allt vara strukturerade mål?

### ⭐ Nattjobb som räknar om `daily_scores`
`daily_scores` skrivs bara styckvis när du öppnar Journal/Träning en viss dag.
Dagar du inte öppnar appen får ingen rad, och `total_score` skrivs aldrig (fixat
i läsläge, se WORKLOG #8, men underliggande datan har luckor). Ett schemalagt
edge-jobb (pg_cron / Supabase scheduled function) skulle varje natt räkna ut
gårdagens per-domän-scores + total ur källtabellerna.
**Omfattning:** stor — kräver att score-logiken (idag i `src/lib/maxxScore.js` +
`tierEngine.js`, ren klient-JS) portas till Deno, ELLER att en enklare
dagsaktivitets-formel definieras server-side. Risk för att klient- och
serverberäkningen driftar isär.
**Beslut du behöver fatta:** ska `daily_scores` vara en trogen historik (kräver
port) eller räcker en enklare "loggnings-aktivitet 0-100"-formel? Eller lämnar vi
det som en best-effort-logg och slutar visa trend på den?

### 💭 `metric`-drivna auto-uppdaterande fält generellt
Både mål-progress (F1) och signaler skulle bli vassare med en central
"metric → senaste värde"-tjänst (sparat, vikt, 5km-tid, netto/månad, pluggtimmar/
vecka …). En modul som mappar en metric-nyckel till rätt query. Skulle användas
av mål, signaler, dashboard-kort och Jarvis.
**Beslut:** värt att bygga som gemensam grund, eller överkonstruktion? Vilka
metrics först?

## Sådant jag valde att INTE bygga trots att det var spår A (och varför)

- **Nattjobb för `daily_scores`.** Frestande ("bakgrundsjobb som inte kräver UI"),
  men score-logiken är ~400 rader klient-JS (`maxxScore.js` + `tierEngine.js` +
  benchmarks). Att porta till Deno = stor risk för tyst drift mellan klient- och
  serverberäkning — precis det du varnade för. Lade i Datamodell-sektionen ovan
  som ett beslut istället. Fixade `total_score`-buggen i läsläge (WORKLOG #8).
- **Mål-auto-progress.** Kräver ett beslut per metric-typ om vilken källa som
  gäller och om manuellt värde vinner. Byggde datalagret (F1) men lät kopplingen
  vara. Se "Auto-progress för mål" ovan.
- **Ekonomi-korrelationer i `correlate.js`.** Ekonomidata är månadsvis, inte
  daglig — passar inte samma dag/vecka-motor. Skulle behöva en egen liten modell
  (månad mot månad). Kändes som scope-glidning mitt i natten; hellre att du säger
  till om du vill ha det.
- **Fler achievements / gamification.** Visionen nämner "njuta av resan", men
  vilka achievements som känns bra är en smakfråga. Rörde inte `achievements.js`.
