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

### 🔥 UI för strukturerade mål (F1 backend är byggt)
Datalagret finns (`goals`-tabell + `src/lib/goals.js` + Jarvis läser dem). Det
som saknas är var man skapar/ser/följer mål. Alternativ:
- **(a) Egen "Mål"-sida** i Mer-menyn — lista per domän, progress-ringar,
  deadline-sortering, "klarmarkera". Renast, men ett nav-tillägg.
- **(b) Dashboard-kort** — de 3 pinnade målen med progress överst på dashboarden,
  klick → detalj. Håller mål "top of mind" men trängs med konstellationen.
- **(c) Sektion per domänsida** — träningsmål på /traning, sparmål på /ekonomi.
  Kontextuellt men splittrar överblicken.
- **(d) Bara i Profil** under "identitet & mål" — lågprofil, men då används de
  sällan.
**Rekommendation:** (a) + (b) tillsammans — sidan för att jobba med mål, kortet
för att inte glömma dem. **Beslut du behöver fatta:** vilken kombination, och om
"livsmålen" (1/3/10 år, fritext) ska migreras in som mål-rader eller lämnas kvar
som separat fritext i Profil.

### ⭐ Auto-progress för mål
Ett sparmål vet inte själv hur mycket du sparat; en 5km-tid vet inte ditt PR.
Idé: en `metric`-koppling så `current_value` fylls automatiskt från rätt källa
(sparmål ← net_worth_history/assets, tid ← run_personal_records, vikt ←
health_logs senaste). **Omfattning:** medel — en mappning metric→query, körd vid
sidladdning eller i ett nattjobb. **Beslut:** vilka metric-typer ska stödjas
först, och ska manuellt satt current_value alltid vinna över auto?

## Domän-specifikt (träning, hälsa, ekonomi, plugg, resor, jobb)

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

## Sådant jag valde att INTE bygga trots att det var spår A (och varför)
