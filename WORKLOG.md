# WORKLOG — autonom natt-session (2026-09-09 → 10)

Branch: `audit-fixes` (avgrenad från `main` @ `e3327b3`).
Regler följda: bara commits på `audit-fixes`, ingen push, ingen deploy, inga
komponent-splittar, ingen ny CSS längst ner i index.css, P3-1 orörd.

Allt som kräver deploy för att märkas är markerat **[DEPLOY]** nedan — kör
`supabase functions deploy <namn>` respektive `supabase db push` när du granskat.

---

## Sammanfattning (fyll på under natten)

| # | Vad | Spår | Filer | Commit | Kräver |
|---|-----|------|-------|--------|--------|
| – | (se poster nedan) | | | | |

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
**Commit:** `<se git log>` "Insights + Jarvis: deterministic weekly signals"
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
**Commit:** `<se git log>` "F3: Apple Health via iOS Shortcuts — ingest endpoint"
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
**Commit:** `<se git log>` "F1: structured goals — data layer + Jarvis integration"
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
**Commit:** `<se git log>` "Jarvis: feed the cross-domain findings into context"
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
**Commit:** `<se git log>` "Jarvis: explicit coaching method in the system prompt"
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
**Commit:** `<se git log>` "Insights: deterministic cross-domain findings"
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
**Commit:** `5f5c7ee` "Kalender: usable month grid on mobile (dots + detail sheet)"
**Kräver av dig:** inget

## Noteringar / observationer för dig

- `git for-each-ref` visar en **dubblerad `refs/remotes/origin/main`** (pekar på
  både `e3327b3` och `161f69d "fix: remove top padding on mobile main"`). Trolig
  rest från iCloud-korruptionen. Ofarligt för arbetet men värt att städa:
  `git remote prune origin` eller ta bort loose ref manuellt. Rörde inte detta.
