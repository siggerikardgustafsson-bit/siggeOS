# WORKLOG — autonom natt-session (2026-09-09 → 10)

Branch: `audit-fixes` (avgrenad från `main` @ `e3327b3`).
Regler följda: bara commits på `audit-fixes`, ingen push, ingen deploy, inga
komponent-splittar, ingen ny CSS längst ner i index.css, P3-1 orörd.

Allt som kräver deploy för att märkas är markerat **[DEPLOY]** nedan — kör
`supabase functions deploy <namn>` respektive `supabase db push` när du granskat.

---

## Session 2 (2026-09-10) — efter merge till main

Post 1–13 mergades till `main` och pushades till prod 2026-09-10 (FF, `e3327b3..a7ab2a6`).
Migration 05/06/07 + `jarvis-chat` + `health-ingest` deployade av dig.
Fortsatt arbete på ny branch `data-sync-jarvis-tools` (av `main`). Poster #14+.

| # | Vad | Commit | Kräver av dig |
|---|-----|--------|---------------|
| 14 | jarvis-chat: `execute_action` täcker nästan hela appen (20 nya skriv-actions) | `83867a7` | **`functions deploy jarvis-chat`** |
| 15 | Datasynk: `log_training` skriver nu `training_exercises` + PR + steg + score; `add_journal_entry` speglar score. Audit-fynd nedan. | `536f0fd` | ingår i samma jarvis-chat-deploy |
| 16 | Kalender: "Kommande"-strip (14 dgr), filter sparas mellan besök, trip-status-bugg (`idé`→`idea`) | `e4ebe73` | inget (frontend) |
| 17 | Dashboard `TodayWidget` blickar framåt (nästa 14 dgr + tenta-nedräkning) istället för bara idag | `bf5671a` | inget (frontend) |
| 18 | Ny sida `/mal` — alla mål på ett ställe (domänfilter + sammanfattning); pin-knapp i GoalsSection; nav överallt | `3d3a917` | jarvis-chat-raden → samma deploy som #14 |
| 19 | Mål-metrics: nuvärden från senaste 120/180 dgr (ej PR från 2022) + progress från baslinje (ej från 0) | `b5c9e52` | **`db push`** (post_deploy_08) |
| 20 | Livsmål (1/3/10 år) på `/mal`, redigerbara + `update_life_goal`-action; fixat schema-probe-race i goals.js | `2cc760a` | jarvis-chat-deploy |
| 21 | Dashboard: "Fästa mål"-remsa under score-vyn (aktiverar pin) | `5cc14d7` | inget (frontend) |
| 22 | Resmål ↔ sparande: `trips.saved_sek` + SPARAT-progressbar + takt-hint; Jarvis ser det | `8a99ca7` | **`db push`** (post_deploy_09) + jarvis-chat-deploy |

Post 14–16 mergades till main + pushades 2026-09-10 (`a7ab2a6..d1e602f`).
Post 17–18: branch `ux-cohesion` → merged + pushed (`d1e602f..1dbbc13`).
Post 19–22: branch `next-ux` → merged + pushed (`1dbbc13..88ef121`).

**Nya migrationer att köra (`supabase db push`):** post_deploy_08 (goals.start_value/baseline_date), post_deploy_09 (trips.saved_sek). Additiva, idempotenta. Frontend degraderar tills de körs (goals.js 3-tier-fallback; trip-sparfältet inert).

## Polish-batch (branch `polish-batch`, av `main`@`88ef121`, PUSHAD men ej mergad) — din bugg/förbättrings-lista

| # | Vad | Commit | Kräver av dig |
|---|-----|--------|---------------|
| P1 | Jarvis datum-bugg: gammal chatt lästes som "idag" → historik dagtaggas `[ÅÅÅÅ-MM-DD]` innan den skickas till modellen | `52888ea` | **jarvis-chat-deploy** |
| P2 | Strava-synk: fel visades som "✓ Analyserade undefined pass"; nu riktig felruta (+ koppla-om-länk) + 401/429-hantering + 4×100 aktiviteter | `52888ea` | **strava-sync-deploy** |
| P3 | Modals fastnade mid-skärm efter scroll: `pageRise`-animationen (`fill:both` som rör transform/filter) gjorde `.page-wrap` + varje `.card` till containing block för alla `position:fixed`. Fixat i CSS (`fill:backwards`, keyframe `filter:none`, `will-change`→`:hover`) + portalerar DetailModal/EvidenceModal till body | `8de3d8e` | inget (frontend) |
| P4 | DetailModal (Maxx Score) omstylad till appens panel-tokens — 82px→64px tier-siffra, `blur(44px)`-glas → vanlig panel, enhetlig | `8de3d8e` | inget |
| P5 | Profil "Livssituation sparas ej": roller är nu primärmodellen (gamla fält under "Fler detaljer", auto-härledda från aktiva roller), spara-bar med "Osparade ändringar"-indikator | `8de3d8e` | inget |
| P6 | Laddnings-skeletons: ny `src/components/Skeleton.jsx` + Insights (full) / Dashboard (score-hero) / Kalender / Ekonomi | `470f1f7` | inget |
| P7 | Kalender: rensad layout — bort med "Kommande"-rutan + redundant månadstitel + 5 stat-kort (räkningen ligger i filter-chipsen); lugnare celler, idag = fylld cirkel | `4d509a4` | inget |
| P8 | Upplevelser-karta: `react-simple-maps` + d3-geo + city-gazetteer → städer som markörer istället för länder. Raderade `worldPaths.js` (1.6MB). Zoom/pan, hover-tooltip, pulserande markörer | `ca26af9` | inget |
| P9 | Dashboard Karta-vyn ryms på en skärm (`.cmap` → `clamp(480px, 100dvh-210px, 720px)`); pinnade mål bara i Träd-vyn. Bubbelkollision verifierad: 0 överlapp | `ef78de4` | inget |
| P10 | Karta: full stads-gazetteer ~24 000 städer (`scripts/gen-cities.mjs` → `src/lib/cityData.js`, 257KB gz i egen chunk som strömmar in EFTER kartan). n-gram-matchning på titlar ("Barcelona NYE" → Barcelona). Alla resor med lokaliserbar stad är nu markörer. | `8ce5d00` | inget |

Alla P1–P10 mergade till `main` + pushade 2026-09-10 (`88ef121..8ce5d00`).
**Kvar för dig:** `supabase functions deploy jarvis-chat` + `supabase functions deploy strava-sync`.

---

## Sammanfattning (natt-sessionen)

13 poster, alla spår A. #1–10 = natt-sessionen. #11–13 = uppföljning på din
begäran (goals-UI + rate limiting + fler mål-metrics). Detaljer per post nedan.

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
| 13 | Fler mål-metrics (1k/halvmara-tid, studietimmar 28d, sparkvot, CSN-fribelopp) + H:MM:SS-formatering | `7555733` | inget (frontend); full funktion efter samma `db push` |

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

### 24. Strava-synk: visa det verkliga felet + härdning
**Spår:** A (du: "strava synken funkar ej")
**Symptom:** `?action=sync` returnerade platt 502 "Strava svarade oväntat vid
hämtning av aktiviteter." `?action=status` funkar (connected, athlete 110767412),
så token-raden finns och token-refresh går igenom → `/athlete/activities` failar
med något som varken är 401 eller 429. Gammal kod slukade Stravas svar.
**BEKRÄFTAD rotorsak** (via `?action=debug`): Strava svarar
`403 {"message":"Forbidden","errors":[{"resource":"Application","field":"Status","code":"Inactive"}]}`
— **Strava-API-appen (client_id 250984) är inaktiverad hos Strava.** Ingen
token-refresh eller omkoppling hjälper. Appägaren måste logga in på
strava.com/settings/api, återaktivera appen och godkänna de uppdaterade
API-villkoren. `858026b` la till diagnostiken som avslöjade det; `<nästa>`
returnerar nu `{error:'app_inactive', detail}` (503) med klartext istället för
502.
**Vad:** alla Strava-GET går nu via `stravaGet()` — explicit `User-Agent` +
`Accept: application/json`, en retry på 5xx/nätverksblipp, returnerar rå status
+ body-snutt. `sync` sid-1-fel returnerar `{stravaStatus, stravaBody}` och
Träning-bannern visar det. `isStravaAuthError()` fångar token-fel som kommer som
200/4xx-body → "koppla om" istf 502. `getValidStravaToken` refreshar 2 min
tidigt + rapporterar saknade `STRAVA_CLIENT_*` som config-fel. Nytt
`?action=debug` (inga hemligheter): token-state + live 1-aktivitets-probe.
**Filer:** `supabase/functions/strava-sync/index.ts`, `src/pages/Traning.jsx`
**Verifiering:** esbuild-transform OK, `npm run build` OK. Kan inte se Stravas
faktiska svar utan deploy (ingen deno lokalt).
**Commit:** `858026b` (mergad → main, pushad)
**Kräver av dig:** **[DEPLOY]** `supabase functions deploy strava-sync` — sen
öppna Träning och kör synken igen. Om den fortf. failar: gå till
`…/functions/v1/strava-sync?action=debug` (inloggad) eller kör synken och
läs `stravaStatus`/`stravaBody` i bannern, klistra hit så finjusterar jag.

### 23. Apple Health — setup-skärm (F3 frontend)
**Spår:** A (ditt val efter polish-batchen)
**Vad:** Ny sektion "Apple Health" i Inställningar. Opt-in: ingen token skapas
förrän du klickar "Aktivera". Visar endpoint + bearer-token (maskerad, Visa/Dölj,
kopieringsknappar), steg-för-steg för iOS-genvägen, exempel-JSON, samt
"senaste mottagna data: X sedan" från `last_ingest_at`. Knappar för **Rotera
token** (gamla dör direkt) och **Stäng av** (nollar token).
**Filer:** `src/pages/Settings.jsx` (lokala `AppleHealthPanel` + `CopyField` +
`relIngest`; ny post i `sections`), `src/lib/healthIngest.js` (`getIngestStatus`
som även läser `last_ingest_at`)
**Verifiering:** preview /installningar → Apple Health — panelen renderar,
Visa/Dölj växlar token (giltig UUID), setup-stegen och exempel-JSON syns.
`npm run build` OK (20s).
**Commit:** `7decd52` (mergad → main, pushad)
**Kräver av dig:** inget nytt — `health-ingest` edge-fn + migration 06/07 är redan
deployade sen tidigare. Om du inte redan har en token: klicka "Aktivera" i UI:t.

### 22. Resmål ↔ sparande
**Spår:** A (ditt förslag 2)
**Vad:** `trips.saved_sek` (migration post_deploy_09) — manuell "avsatt hittills".
På planerade/idé-resor med budget visar Upplevelser en **SPARAT**-progressbar
("3 500 / 10 000 kr · 35%"), inline-redigerbar, plus takt-hint från avresedatum
("Lägg 2 700 kr/mån för att hinna"). Jarvis: `fetch_experiences` tar med saved_sek
+ månadstakten, `update_trip` accepterar `saved_sek`.
**Filer:** `supabase/migrations/20260703094000_post_deploy_09_trip_saved.sql` (ny),
`src/pages/Upplevelser.jsx` (TripSavings-komponent + updateTripSaved),
`supabase/functions/jarvis-chat/index.ts`
**Verifiering:** preview /upplevelser — SPARAT-raden renderar på "Bestiga
Kebnekaise" (0/10 000, 0%), inline-edit öppnar. Skrivning 400:ar tills
post_deploy_09 körs (optimistisk lokal uppdatering + toast vid fel).
`npm run build` OK.
**Commit:** `8a99ca7`
**Kräver av dig:** **[DEPLOY]** `supabase db push` + jarvis-chat-deploy.
Alternativ sparkälla (kopplat sparmål via `goals.linked_trip_id`) → IDEAS.

### 21. Dashboard: "Fästa mål"-remsa
**Spår:** A (ditt förslag 1)
**Vad:** Pin-knappen (#18) hade ingen effekt utanför /mal. Ny `PinnedGoals`
renderar aktiva fästa mål direkt under score-vyn (både Karta och Träd) — titel,
baslinje→nu/mål, progressbar, dagar kvar — och länkar till /mal. Visar inget när
inget är fäst.
**Filer:** `src/components/dashboard/PinnedGoals.jsx` (ny), `src/pages/Dashboard.jsx`
**Verifiering:** preview / — "FÄSTA MÅL: Bänk 110 · 59% · 65→110 kg" efter att
målet fästs. `npm run build` OK.
**Commit:** `5cc14d7`
**Kräver av dig:** inget (frontend).

### 20. Livsmål på /mal + fix schema-probe-race
**Spår:** A (ditt förslag 3)
**Vad:** `/mal` fick en **Livsmål**-sektion: 1/3/10-års-fritextmålen från
`user_settings.goals`, inline-redigerbara → /mal är nu enda hemmet för alla
sorters mål. `jarvis-chat`: `update_life_goal`-action (merge-säker patch av den
delade goals-JSONB:n). **Bugg fixad:** goals.js 3-tier-kolumnprob kördes per
anropare som race:ade räknaren förbi V5 till LEGACY under samtidiga anrop
(Mal-summering + GoalsSection, dubblat av StrictMode) → tappade metric/pin,
/mal sa "Mål-tabellen är inte redo än". Nu en enda probe via delad in-flight-promise.
**Filer:** `src/pages/Mal.jsx`, `src/lib/goals.js`,
`supabase/functions/jarvis-chat/index.ts`
**Verifiering:** preview /mal — Livsmål visas & sparas; "1 aktiva · 0 uppnådda"
konsekvent (ingen race); en probe-request istället för ~5. `npm run build` OK.
**Commit:** `2cc760a`
**Kräver av dig:** jarvis-chat-deploy för `update_life_goal`.

### 19. Mål-metrics: senaste data + baslinje
**Spår:** A (din felrapport på de nya mål-elementen)
**Två problem du flaggade:**
1. Styrke-/löp-nuvärden kom från all-time-PR-tabellerna — en bänk-PR från 2022
   är inte din bänk idag. `strengthPR` läser nu tyngsta matchande set ur
   `training_exercises` senaste 120 dgr (`runPR`: bästa tid senaste 180 dgr).
   Ingen färsk data → null, inte en gammal siffra. Live: bänkmålet visar nu
   65 kg (2026-06-15) istället för 120 kg (2022-12-01).
2. Progress räknades från 0 — bänk 80 mot mål 100 = "80%", men man börjar inte
   på tom stång. Nya `goals.start_value` + `baseline_date` (migration
   post_deploy_08): progress = (nu − start) / (mål − start), klämd till 0–1.
   Fångas vid skapande (löst metric-värde eller inmatat nuläge), redigerbart i
   formuläret ("Startvärde"), och lat-backfillas en gång för äldre mål. Faller
   tillbaka på gamla kvoten tills baslinje finns.
`goals.js` gör nu 3-tier-kolumnfallback (FULL/V5/LEGACY) så ett deploy mellan
migrationer ändå laddar mål med metric+pin. `jarvis-chat` create_goal fångar
start_value.
**Filer:** `src/lib/goalMetrics.js`, `src/lib/goals.js`,
`src/components/GoalsSection.jsx`, `src/pages/Mal.jsx`,
`supabase/functions/jarvis-chat/index.ts`,
`supabase/migrations/20260703093000_post_deploy_08_goal_baseline.sql` (ny)
**Verifiering:** preview /mal — bänkmålet 65→110 kg, 59% (baslinje aktiveras
efter post_deploy_08); "Startvärde"-fält i formuläret; recent-window-resolvern
verifierad mot verklig data. `npm run build` OK.
**Commit:** `b5c9e52`
**Kräver av dig:** **[DEPLOY]** `supabase db push` (post_deploy_08).

### 18. Ny sida /mal + pin
**Spår:** A (din begäran: mer sammanflätat/användbart — IDEAS-item "egen Mål-sida")
**Vad:** `/mal` samlar alla mål oavsett domän: domänfilter-chips (Alla/Träning/…),
en sammanfattningsremsa (på-god-väg-antal, närmaste deadline, mål per domän) och
den befintliga `<GoalsSection>` återanvänd med vald domän (`key={filter}` → ren
remount). `GoalsSection` fick en **pin-knapp** per mål (aktiverar `goals.pinned`
som saknade UI); pinnade mål sorteras först överallt sektionen renderas. `/mal`
inlagt i BottomNav (Mer), Sidebar, CommandPalette + Jarvis LÄNKAR.
**Filer:** `src/pages/Mal.jsx` (ny), `src/components/GoalsSection.jsx`,
`src/App.jsx`, `src/components/{BottomNav,Sidebar,CommandPalette}.jsx`,
`supabase/functions/jarvis-chat/index.ts` (LÄNKAR-raden)
**Verifiering:** preview /mal — sammanfattning + filter + pin-toggle funkar
(pin sparas till DB och sorteras om); "Inga aktiva mål för hälsa" vid tomt filter.
`npm run build` OK (Mal-chunk 1.7 kB gz).
**Commit:** `3d3a917`
**Kräver av dig:** frontend inget. LÄNKAR-raden → `supabase functions deploy jarvis-chat` (samma som #14).

### 17. Dashboard TodayWidget blickar framåt
**Spår:** A (din begäran: mer användbart)
**Vad:** `TodayWidget` visade bara dagens händelser → tom dag = ingen signal om
tentan om 3 dagar. Nu hämtar den även nästa 14 dagar och visar en
"Härnäst"/"Kommande"-sektion vars längd beror på hur full dagen är (4 rader när
idag är tom, 2 när lätt, 0 när full). En tenta inom 14 dagar får alltid en röd
nedräknings-callout överst. Obligatoriska-titlar körs genom samma städare som
Kalendern. Tomt läge = "Allt lugnt · inget de närmaste två veckorna" bara när
det faktiskt är tomt framåt.
**Filer:** `src/components/dashboard/TodayWidget.jsx`
**Verifiering:** preview (Karta-vy, Idag-orb) — "Idag 1 händelse" + "HÄRNÄST:
PA-pass vaken (Imorgon), obligatoriskt (Om 4d)". `npm run build` OK.
**Commit:** `bf5671a`
**Kräver av dig:** inget (frontend).

### 16. Kalender — kommande-strip + kvalitetsfixar
**Spår:** A (din begäran: "jobba vidare på kalendern och dess funktioner")
**Vad:**
- **"Kommande"-strip** ovanför månadsgriden: nästa 14 dagar, alla event-typer
  (utom passiva journal/hälsa-loggar), en rad per grej med relativ tid
  ("idag" / "imorgon" / "om 4d"), färgprick + ikon + datum. Tap → öppnar den
  dagens detaljpanel. Samma dag + samma etikett kollapsas (två "Grupparbete"
  blir en rad; full detalj ett tap bort). Resor visas en gång, inte per dag.
  Bara på innevarande månad — `fetchAll` drar då ~3 v extra bortom månadsskiftet.
- **Filter-chipsen sparas** i localStorage (`maxxit.kalender.filters`) → dina
  bortvalda typer är kvar nästa besök.
- **Bugg:** trip-queryn filtrerade `.neq('status','idé')` (svenska) mot engelsk
  kanon `idea` (AUDIT P0-1) → reseidéer visades på kalendern och detaljpanelen
  kallade dem "Avklarad resa". Nu `idea` + rätt etikett (Reseidé/Planerad/Avklarad).
**Filer:** `src/pages/Kalender.jsx` (ingen ny CSS — `.card` + inline)
**Verifiering:** preview /kalender — strippen visar PA-pass + obligatoriska korrekt
med rätt relativ tid; tap på "Eget arbete" valde mån 14/9 och panelen visade
dagens tre moment. `npm run build` OK.
**Commit:** `e4ebe73`
**Kräver av dig:** inget (frontend). Pusha `data-sync-jarvis-tools` / merga till main.

### 15. Datasynk-audit + parity för Jarvis-skrivningar
**Spår:** A (din begäran: "garantera att alla datapunkter överallt är synkade")
**Vad jag gick igenom:** varje tabell som skrivs från flera håll (app-UI,
Strava/health-ingest, Jarvis) och varje härledd/speglad yta.
**Resultat — det som redan stämmer:**
- **Maxx Score / tiers räknas live ur källtabellerna** (`tierEngine.js` +
  `Dashboard.jsx` läser `training_sessions`/`health_logs`/… direkt, inte
  `daily_scores`). Domänsidorna läser samma tabeller → headline-score och
  siddata kan inte drifta isär. Detta är den viktiga garantin och den håller.
- `health_logs` har flera skribenter men alla gör *partiella* upserts
  (`onConflict: user_id,date`) → kolumner som inte skickas rörs inte, de slår
  inte ut varandra.
- Strava-sync skriver både `training_sessions` och `run_personal_records` →
  löp-PR-tavlan och `run_5k`/`run_10k`-målmetrics hålls i synk.
- Mål-metrics (`goalMetrics.js`) läser kanoniska källtabeller (bänk-PR ur
  `personal_records`, netto ur income/expense/fixed_costs, …).
**Resultat — det jag FIXADE (post 15-koden):**
- `execute_action.log_training` skapade tidigare en naken `training_sessions`-rad:
  inga `training_exercises`, ingen PR-koll, ingen stegspegling, ingen
  `daily_scores`. Sa användaren "logga gympass, bänk 130×3 PR" blev passet
  tomt i appen och PR-tavlan + `bench_pr`-målet stod kvar. Nu tar `log_training`
  emot `exercises:[{name,sets:[{reps,weight_kg}]}]`, skriver set-raderna, höjer
  `personal_records` för viktbaserade lyft (tyngsta vikt vinner — samma regel
  som `src/lib/exercises.js`), speglar `steps` till `health_logs` och skriver
  `score_training` med Träning-sidans formel.
- `add_journal_entry` speglar nu `score_journal`/`score_health` med Journal-
  sidans formler (utöver sömn/energi-spegling till `health_logs` som redan fanns).
- Ny hjälpare `upsertDailyScore()` i edge-fn: merge-max per nyckel, best-effort
  (får aldrig fälla själva skrivningen).
**Resultat — kvar (dina beslut, se IDEAS.md):**
- `daily_scores` är fortfarande en *partiell* logg: bara `score_training` +
  `score_journal`/`score_health` skrivs regelbundet; `score_economy/study/social/
  work` nästan aldrig; `total_score` aldrig (härleds läs-sida, post 8). Ett
  nattjobb är rätt lösning — ligger i IDEAS.
- `health_logs.source` kan skrivas över av en senare partiell upsert (bara
  "varifrån kom datan"-etiketten, kosmetiskt).
- Fritext-livsmålen (`user_settings.goals.one_year/…`) kan Jarvis inte redigera
  och de syns inte i GoalsSection — funktionsglapp, i IDEAS.
**Filer:** `supabase/functions/jarvis-chat/index.ts`
**Verifiering:** esbuild .ts-transform OK. Kan ej köra edge-fn lokalt (ingen
deno); varje ny gren följer exakt mönstret från de befintliga ~30 case:en.
**Commit:** `536f0fd`
**Kräver av dig:** **[DEPLOY]** `supabase functions deploy jarvis-chat` (samma
som post 14).

### 14. jarvis-chat: execute_action täcker nästan hela appen
**Spår:** A (din begäran: "ge Jarvis utförlig möjlighet att redigera/lägga till
data i alla databaser")
**Varför:** `execute_action` kunde skriva till ~10 tabeller. Bl.a. kunde Jarvis
*läsa* de nya strukturerade målen men inte skapa/ändra dem, inte logga plugg,
inte logga näring/kosttillskott, inte logga socialt.
**Vad:** 20 nya actions, alla efter samma mönster (RLS-klient, explicit
`user_id`-filter, `clean()` för valfria fält, defensiva kast):
- **goals**: create/update/complete/delete (kopplar metric så progress
  auto-uppdateras)
- **plugg**: log_study, create_course, add_exam
- **hälsa-nära**: log_nutrition (upsert), log_supplement (upsert)
- **upplevelser**: log_social, create/update_side_quest, update/delete_adventure
- **luckor**: update_income, delete_trip
- **journal**: add_journal_entry (speglar sömn/energi till health_logs)
Systemprompten säger nu att skrivytan är bred och att sätta metric på nya mål.
**Filer:** `supabase/functions/jarvis-chat/index.ts` (TOOLS-enum + data-desc +
20 switch-case)
**Verifiering:** esbuild .ts-transform OK. enum ↔ case-paritet verifierad
(43/43). Varje ny skrivforms kolumner härledda ur appens egna insert-anrop.
**Commit:** `83867a7` "jarvis-chat: expand execute_action to cover most of the app"
**Kräver av dig:** **[DEPLOY]** `supabase functions deploy jarvis-chat`

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

### 13. Fler mål-metrics + tid-formatering
**Spår:** A (bygger vidare på post 12, ren additiv logik)
**Varför:** `goalMetrics.js` täckte 15 metrics men saknade självklara: 1 km- och
halvmaraton-tid, studietimmar över 28d (parallellt med pass 28d, för tenta-mål),
sparkvot (som du frågar Jarvis om) och CSN-fribeloppet (blockerande för en
läkarstudent som jobbar PA). Tid ≥ 1h visades dessutom som "100:00" istället för
"1:40:00".
**Vad:** 6 nya metric-nycklar i `GOAL_METRICS`: `run_1k`, `run_half`
(← run_personal_records, distance_key 1k/half_marathon), `study_hours_28d`
(← study_sessions), `savings_rate` (netto/inkomst denna månad, %), `csn_fribelopp`
(income_logs där counts_toward_csn, summerat på innevarande termin — samma
halvårsfönster som Ekonomi-sidan använder). `monthAggregate` fick ett `rate`-läge.
`formatMetricValue` för `unit:'s'` ger nu `H:MM:SS` när tiden är ≥ 1 timme.
Inga nya tabeller, ingen migration, ingen ny CSS. GoalsSection plockar upp dem
automatiskt via registret.
**Filer:** `src/lib/goalMetrics.js`
**Verifiering:** `npm run build` OK, esbuild-parse OK. Preview (/ekonomi →
Sparande → Nytt mål): de nya ekonomi-metrics syns i dropdownen, "Sparkvot denna
månad" auto-fyller enhet `%` och döljer riktning/nuläge korrekt. Resolvers är
defensiva (null vid fel/saknad data). Konsol-felen i preview är
`ERR_INTERNET_DISCONNECTED` (browser-panelen saknar nät), inte kod.
**Commit:** `7555733`
**Kräver av dig:** inget för frontend. Metric-kopplingen sparas först efter
`supabase db push` (post_deploy_05), som post 12.

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
