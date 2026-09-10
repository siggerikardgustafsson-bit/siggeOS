# WORKLOG — autonom natt-session (2026-09-09 → 10)

Branch: `audit-fixes` (avgrenad från `main` @ `e3327b3`).
Regler följda: bara commits på `audit-fixes`, ingen push, ingen deploy, inga
komponent-splittar, ingen ny CSS längst ner i index.css, P3-1 orörd.

Allt som kräver deploy för att märkas är markerat **[DEPLOY]** nedan — kör
`supabase functions deploy <namn>` respektive `supabase db push` när du granskat.

---

## Sammanfattning

12 poster, alla spår A. #1–10 = natt-sessionen. #11–12 = uppföljning på din
begäran (goals-UI + rate limiting). Detaljer per post nedan.

| # | Vad | Commit | Kräver av dig |
|---|-----|--------|---------------|
| 1 | Mobillayout för månadskalendern (prickar + detaljpanel) | `5f5c7ee` | inget |
| 2 | `src/lib/correlate.js` — deterministiska tvärdomän-kopplingar i Insights | `5b185c9` | inget |
| 3 | Vassare coaching-metod i Jarvis systemprompt | `9f6c731` | **`functions deploy jarvis-chat`** |
| 4 | Jarvis ser kopplingarna (MÖNSTER-block i kontext) | `2347116` | inget (frontend) |
| 5 | F1 — strukturerade mål: `goals`-tabell + `src/lib/goals.js` + Jarvis | `7c9b161` | **`db push` + `functions deploy jarvis-chat`** |
| 6 | F3 — Apple Health via Shortcuts: `health-ingest` edge-fn + token | `b23d9f3` | **`db push` + `functions deploy health-ingest --no-verify-jwt`** |
| 7 | `src/lib/signals.js` — deterministiska veckosignaler (Insights + Jarvis) | `5be23c2` | prompt-raden → samma deploy som #3 |
| 8 | Bugg: `daily_scores.total_score` alltid 0 → härleds nu i läsläge | `0da8939` | inget |
| 9 | Veckorapporten ("Analysera vecka") grundas i fynd + signaler | `e70d8e2` | inget |
| 10 | Bugg: lag-korrelationer räknade fel dag (tidszon) → UTC-ankrat | `1318683` | inget |
| 11 | health-ingest: 30s per-token rate limit (429) | `90248b7` | **`db push` + `functions deploy health-ingest --no-verify-jwt`** |
| 12 | Mål-UI per domänsida (/traning, /ekonomi, /profil) + `goalMetrics.js` (live datakoppling) | `8eee030` | frontend inget; full funktion efter **`db push`** (post_deploy_05) |

**Deploy-lista (kör i denna ordning när du granskat diffen):**
```
cd ~/dev/sigge-os
git checkout audit-fixes            # om du inte redan är här
supabase db push                    # post_deploy_05 (goals), 06 (health_ingest_token), 07 (last_ingest_at)
supabase functions deploy jarvis-chat
supabase functions deploy health-ingest --no-verify-jwt
```
Inget rör `main`. Inget är pushat. Vercel bygger inte förrän du mergar/pushar `audit-fixes` (eller cherry-pickar).

Migrationer är additiva + idempotenta. `goals`-tabellen fanns redan (12 kolumner,
0 rader, oanvänd) — migration 05 UTÖKAR den, skapar den inte.

**Före migration 05:** Mål-UI:t fungerar men i enklare läge — ingen metric-
koppling och ingen pin sparas (kolumnerna finns inte än). Varje sida gör EN
misslyckad query (400 i nätverksfliken) första gången per session, faller sedan
tillbaka och kommer ihåg det. Efter `db push` försvinner 400:orna och
metric-kopplingen börjar spara. Du kan skapa mål redan nu, de uppgraderas inte
retroaktivt med metric — sätt om metric på dem efter deploy, eller vänta med att
skapa mål tills efter `db push`.

---

## Poster

<!-- Ny post överst. Mall:
### N. Rubrik
**Spår:** A
**Varför:** …
**Vad:** …
**Filer:** …
**Verifiering:** …
**Commit:** `<hash>` "<meddelande>"
**Kräver av dig:** inget / `supabase functions deploy x` / `supabase db push`
-->

### 12. Mål-UI per domänsida + live datakoppling (din begäran, alt. c+d)
**Spår:** A
**Varför:** Du valde (c) mål-sektion per domänsida + (d) i Profil, och krävde att
de kopplas till rätt datapunkter så progressen syns.
**Vad:** Ny `<GoalsSection>`-komponent (skapa/redigera/ta bort/klarmarkera, med
progress-rad) på tre ytor: `/traning` (Träningsmål), `/ekonomi` Sparande-fliken
(Ekonomimål), `/profil` under Fokusområden (alla domäner). Ny `src/lib/goalMetrics.js`
mappar ett måls `metric` till dess LIVE-värde ur rätt tabell:
bänk/knäböj/marklyft-PR ← personal_records · 5k/10k-tid ← run_personal_records ·
pass 7d/28d ← training_sessions · vikt/fett/sömn/steg ← health_logs ·
nettoförmögenhet ← net_worth_history/assets · netto & inkomst denna månad ←
income/expense/fixed_costs · studietimmar 7d ← study_sessions. Mål utan metric
använder ett manuellt inmatat nuläge. `goals.js` degraderar snyggt före
migration 05 (se sammanfattningen ovan). Ingen ny CSS — bara befintliga
klasser (`.card`, `.input`, `.btn*`) + inline-layout.
**Filer:** `src/components/GoalsSection.jsx` (ny), `src/lib/goalMetrics.js` (ny),
`src/lib/goals.js` (schema-fallback), `src/pages/Traning.jsx`,
`src/pages/Ekonomi.jsx`, `src/pages/Profile.jsx`
**Verifiering:** preview — sektionerna renderar på alla tre sidor; metric-
resolvers ger rätt värden mot verklig data (bänk 120kg, 5k 22:09,
nettoförmögenhet 1805kr, pass 2); skapa/lista/ta bort funkar via fallback;
1440s → "24:00", 114500 → "114 500 kr". `npm run build` OK.
**Commit:** `8eee030` "Goals UI: per-domain sections wired to live data"
**Kräver av dig:** frontend inget. `supabase db push` för full funktion (metric-
koppling + pin). Se även: Jarvis läser redan `goals` (post 5) — samma migration.

### 11. health-ingest: 30s per-token rate limit
**Spår:** A (din begäran — ENDAST rate limiting i filen)
**Varför:** Publik endpoint (`--no-verify-jwt`) utan någon spärr (din
säkerhetsgranskning, punkt 3 = blockerande).
**Vad:** Migration `post_deploy_07` lägger `user_settings.last_ingest_at`.
Funktionen läser den vid token-uppslaget, returnerar **429** om senaste LYCKADE
skrivning för token:en var < 30s sedan, och stämplar `last_ingest_at` **först
efter** att upserten faktiskt gått igenom (rad ~100) — avvisade requests flyttar
aldrig fönstret. Per token, inte per IP. Ingen annan ändring i filen (verifierat).
**Filer:** `supabase/functions/health-ingest/index.ts` (rad 58 + 63-71 + 100-101),
`supabase/migrations/20260703092000_post_deploy_07_health_ingest_last_seen.sql` (ny)
**Verifiering:** esbuild .ts-transform OK. Kan ej köra edge-fn lokalt; logiken
granskad. `sinceMs >= 0`-guard hanterar framtida/skev tidsstämpel.
**Commit:** `90248b7` "health-ingest: 30s per-token rate limit"
**Kräver av dig:** **[DEPLOY]** `supabase db push` + `supabase functions deploy
health-ingest --no-verify-jwt`.
De andra 5 punkterna i din granskning (klartext-token, generisk 500,
datumvalidering, revoke-UI, anomali-detektion) är MEDVETET inte rörda.

### 10. Bugg: tvärdomän-lag-korrelationer räknade fel dag (tidszon)
**Spår:** A
**Varför:** `new Date('2026-09-09T00:00:00')` är lokal midnatt; `.toISOString()`
läser tillbaka den som 2026-09-08 i Europe/Stockholm (UTC+2). Lag-1-uppslagen
("nattens sömn → nästa dags energi", "dagen efter nattpass → energi") landade
alltså på *samma* dag, och veckonycklar hamnade på söndagar.
**Vad:** All datummatte i `correlate.js` UTC-ankrad (`parseUTC`/`addDaysUTC`/
`weekKey` med getUTCDay). `signals.js` använder lokal-komponent-formaterare för
"idag" så den inte hoppar en dag på kvällen.
**Filer:** `src/lib/correlate.js`, `src/lib/signals.js`
**Verifiering:** syntetiskt 45-dagarsset i Europe/Stockholm — lag-1 sömn→energi-
fyndet triggar korrekt på data där energi beror på gårdagens sömn.
**Commit:** `1318683`
**Kräver av dig:** inget

### 9. Veckorapporten grundas i fynd + signaler
**Spår:** A
**Vad:** `buildReportSummary()` i Insights skickar nu även de deterministiska
tvärdomän-fynden och veckans signaler till "Analysera vecka"-prompten, så
AI-rapporten resonerar från samma uträknade material som sidan visar.
**Filer:** `src/pages/Insights.jsx`
**Commit:** `e70d8e2`
**Kräver av dig:** inget

### 8. Bugg: `daily_scores.total_score` är alltid 0
**Spår:** A (latent bugg i sekundärt system)
**Varför:** `daily_scores` får bara sina per-domän-kolumner skrivna (från Journal
+ Träning). `total_score` beräknas aldrig → står 0 för varje dag. Jarvis kontext
sa "SCORE IDAG: total:0" varje dag; WeeklyReview:s score-trend var alltid 0→0.
Detta är INTE den riktiga Maxx Score (den räknas live i maxxScore.js/tierEngine.js
och visas på dashboarden) — `daily_scores` är en separat historik-logg.
**Vad:** Båda läsställena härleder nu ett dagsvärde live = snitt av de domän-
kolumner som har ett värde den dagen. Jarvis-raden ommärkt så modellen fattar att
det är 0-100 dagsaktivitet, skilt från tier-systemet i MAXX INTELLIGENS.
**Filer:** `src/pages/Jarvis.jsx`, `src/components/WeeklyReview.jsx`
**Verifiering:** live-probe bekräftade total_score=0 på alla rader medan
score_training=80 m.fl. skrivs. `npm run build` OK.
**Commit:** `0da8939`
**Kräver av dig:** inget. Se även IDEAS.md — den djupare frågan är om
`daily_scores` ska räknas om av ett nattjobb så luckor fylls.

### 7. Deterministiska veckosignaler (Insights + Jarvis)
**Spår:** A
**Varför:** Insights-underrubriken säger "Mönster, risker och signaler" men det
fanns inga signaler — bara AI-observationer (som 500:ar utan kredit).
**Vad:** Ny `src/lib/signals.js` — `detectSignals()` räknar ut veckans risker/
möjligheter helt utan AI: sömnunderskott/stark vecka (7d), träningsuppehåll mot
egen median-kadens/stark vecka, tenta-beredskap (tenta ≤21d + <3h loggad plugg
på kursen senaste 14d), lucka i hälsologgen, nikotin-slip vecka mot vecka, vikt
som står still mot ett satt mål + passerad deadline. Positiva signaler ingår.
Renderas som kort-stack överst i Insights (funkar även när AI-endpointen är nere)
och läggs som `SIGNALER`-block i Jarvis-kontexten; prompten säger åt Jarvis att
ta upp de viktigaste oombedd i brief/veckosvar.
**Filer:** `src/lib/signals.js` (ny), `src/pages/Insights.jsx` (fetch utökad med
nicotine + goals + exam_date; ny Signaler-sektion), `src/pages/Jarvis.jsx`
(SIGNALER-block), `supabase/functions/jarvis-chat/index.ts` (prompt-rad)
**Verifiering:** preview — visar "Hälsologgen har en lucka" (6d) och "Viktmålet:
deadline passerad, vikten står still" (71.7 vs 67kg, deadline 2026-07-20,
+0kg/3v). Båda korrekta mot verklig data. `npm run build` OK.
**Commit:** `5be23c2`
**Kräver av dig:** frontend-delen inget. Prompt-raden → `supabase functions
deploy jarvis-chat` (samma deploy som post 3).

### 6. F3 — Apple Health via iOS Shortcuts: ingest-endpoint (backend)
**Spår:** A (backend). Setup-UI → IDEAS.md.
**Varför:** `export.xml`-importen (200MB–1GB) kraschar fliken (audit P1-7). En
Shortcut som POST:ar dagens mätvärden är robust och kräver ingen stor fil.
**Vad:** Ny edge-funktion `health-ingest` — `Bearer <token>` → service-role-
uppslag till user_id (litar aldrig på user_id i payloaden) → bounds-checkade fält
→ merge-inte-skriv-över-upsert i `health_logs` (bara skickade fält skrivs; source
sätts bara vid skapande). 4KB payload-tak. Migration `post_deploy_06` lägger
`user_settings.health_ingest_token` (uuid, unik partiell index, null tills opt-in).
`src/lib/healthIngest.js`: getOrCreate/rotate/disable + `ingestSetup()`.
Godkända fält: weight_kg, body_fat_pct, steps, sleep_hours, resting_hr, caffeine_mg.
**Filer:** `supabase/functions/health-ingest/index.ts` (ny),
`supabase/migrations/20260703091000_post_deploy_06_health_ingest_token.sql` (ny),
`src/lib/healthIngest.js` (ny)
**Verifiering:** esbuild .ts + .js OK. Logiken granskad rad för rad (kan ej köra
edge-fn lokalt utan deno/deploy).
**Commit:** `b23d9f3`
**Kräver av dig:** **[DEPLOY]**
`supabase db push` (token-kolumnen) och
`supabase functions deploy health-ingest --no-verify-jwt`  ← **--no-verify-jwt är
obligatoriskt**, Shortcut:en skickar en egen bearer, inte en Supabase-JWT.
`SUPABASE_SERVICE_ROLE_KEY` är redan satt (strava-sync/google-calendar-sync
använder den).

### 5. F1 — strukturerade mål: datalager + Jarvis (backend)
**Spår:** A (backend). UI → IDEAS.md.
**Varför:** "Mål" är en domän i visionen men finns bara som fritext-blob i
`user_settings.goals`. Det fanns redan en oanvänd `goals`-tabell i databasen.
**Vad:** Migration `post_deploy_05` UTÖKAR den befintliga tabellen additivt
(metric, direction, pinned, linked_trip_id, sort_order, completed_at + CHECK +
updated_at-trigger + kanonisk owner-RLS — `goals` var aldrig med i Phase 1-listan).
`src/lib/goals.js`: list/create/update/delete + goalProgress/goalDaysLeft/goalLine.
`category` = domän, `deadline` = måldatum (kolumner som redan fanns). Jarvis
kontext får ett "AKTIVA MÅL"-block; `fetch_memory_goals` returnerar även dem.
Fritext-livsmålen i user_settings.goals är orörda.
**Filer:** `supabase/migrations/20260703090000_post_deploy_05_goals_table.sql` (ny),
`src/lib/goals.js` (ny), `src/pages/Jarvis.jsx`, `supabase/functions/jarvis-chat/index.ts`
**Verifiering:** live-tabellen probead (12 befintliga kolumner, 0 rader, inget i
appen läser den). Pre-migration kastar `listGoals` → Jarvis-kontext degraderar
till "Inga aktiva mål satta" (verifierat, ingen krasch). `npm run build` OK,
esbuild .ts-transform OK.
**Commit:** `7c9b161`
**Kräver av dig:** **[DEPLOY]** `supabase db push` + `supabase functions deploy jarvis-chat`

### 4. Jarvis ser kopplingarna (MÖNSTER-block i kontext)
**Spår:** A
**Varför:** Jarvis kontext var "lean snapshot" + MAXX INTELLIGENS. Den såg
dagens siffror men inga mönster över tid — kunde inte säga "dina tunga PA-veckor
äter träningen" för den datan fanns inte i prompten.
**Vad:** `refreshContext` kör samma `crossDomainFindings()` som Insights över 90d
och lägger ett `MÖNSTER (90d)`-block i kontexten. Best-effort, cachas med resten,
degraderar tyst. Systemprompten (post 3) instruerar Jarvis att bygga vidare på det.
**Filer:** `src/pages/Jarvis.jsx` (`refreshContext`)
**Verifiering:** preview — de 5 queries lyckas, merge ger samma fynd som Insights.
`npm run build` OK.
**Commit:** `2347116`
**Kräver av dig:** inget (frontend). Jarvis-svarens kvalitet syns först när
Anthropic-krediten fyllts på — 500 i preview beror på tom kreditbalans, inte kod.

### 3. Vassare coaching-metod i Jarvis systemprompt
**Spår:** A
**Varför:** Prompten sa "datadriven, konkret, aldrig generisk" men inte HUR man
coachar. Visionen: Jarvis ska kännas som en coach som känner MIG.
**Vad:** Nytt COACHNING-block i `buildSystemPrompt`: utgå från hens egna siffror
och citera dem; koppla domäner (sömn↔tier, ekonomi↔resmål, plugg↔träning↔sömn,
jobb↔energi) och leta ledande indikatorer; använd MAXX INTELLIGENS som objektivt
tier-system; skilj fakta/hypotes/gissning; avsluta coaching med EN mätbar nästa
åtgärd; lyft framsteg, inte bara brister.
**Filer:** `supabase/functions/jarvis-chat/index.ts` (`buildSystemPrompt`, ren
sträng-edit i template-literalen)
**Verifiering:** esbuild-transform av .ts OK (deno ej installerad → ingen
`deno check`; ändringen är ren text i en befintlig template-literal).
**Commit:** `9f6c731`
**Kräver av dig:** **[DEPLOY]** `supabase functions deploy jarvis-chat`

### 2. Deterministiska tvärdomän-kopplingar i Insights
**Spår:** A
**Varför:** Visionen: "hittar insikter jag inte själv skulle sett i datan". Den
befintliga korrelationsmatrisen är daglig och rå (Pearson-r). Den fångar inte
lag (gårdagens sömn → dagens ork), inte veckoaggregat (PA-timmar/vecka →
träningsvolym/vecka), och presenterar r-värden, inte slutsatser.
**Vad:** Ny ren modul `src/lib/correlate.js` — `crossDomainFindings(days)` räknar
ut nio möjliga fynd på svenska ur användarens egen historik, helt utan AI:
sömn<6h → nästa dags energi (lag-1); veckosömn → veckans träningsvolym;
veckans PA-timmar → träningsvolym; veckans pluggtimmar → sömn; träningsdag →
humör; dag efter nattpass → energi; träningsfrekvens → viktförändring/vecka;
bästa träningsveckorna → deras sömn; steg → sömn. Varje fynd bär `n`, döljs om
gruppgapet är för litet, och flaggas "PRELIMINÄR" vid tunt underlag.
`findingsToPrompt()` matar in samma fynd i AI-observations-prompten så modellen
bygger vidare på riktigt material.
**Filer:** `src/lib/correlate.js` (ny), `src/pages/Insights.jsx` (daglig merge
utökad med steg/vikt/PA, ny "Kopplingar"-panel överst i Samband & mönster)
**Verifiering:** preview — 90d: "Aktiva dagar ger dig bättre sömn" (steg↔sömn,
n=20). 1år: "Tunga PA-veckor äter din träning" (0.8 vs 1.8 pass/v, 17 veckor) +
PRELIMINÄR nattpass↔energi (n=4). `npm run build` OK.
**Commit:** `5b185c9`
**Kräver av dig:** inget

### 1. Mobillayout för månadskalendern
**Spår:** A (uttryckligen efterfrågat)
**Varför:** 7-kolumnersgriden renderade text-chips i ~50px-celler → varje event
blev en enda bokstav ("S.", "E."). Dag-detaljpanelen var en 300px sidokolumn
som sprack på telefon. Kalendern var i praktiken oanvändbar på mobil.
**Vad:** Under 768px: enbokstavs veckodagsrubriker, ~44px celler, centrerad
dagssiffra, en färgad prick per event-typ den dagen (max 4) istället för chips.
Detaljpanelen hamnar under griden i full bredd och scrollar in i vy vid tap.
Desktop helt oförändrat (verifierat i preview).
**Filer:** `src/pages/Kalender.jsx` (inline `useIsMobile`-hook + `isMobile`-gren
i cell-render och grid-layout; ingen ny CSS)
**Verifiering:** preview 375px — griden får plats, prickar visar rätt färger,
tap på dag 9 öppnar panel med "Gym / Eget arbete / Grupparbete …". Desktop
oförändrat. esbuild-parse OK.
**Commit:** `5f5c7ee`
**Kräver av dig:** inget

## Noteringar / observationer för dig

- `git for-each-ref` visar en **dubblerad `refs/remotes/origin/main`** (pekar på
  både `e3327b3` och `161f69d "fix: remove top padding on mobile main"`). Trolig
  rest från iCloud-korruptionen. Ofarligt för arbetet men värt att städa:
  `git remote prune origin` eller ta bort loose ref manuellt. Rörde inte detta.
