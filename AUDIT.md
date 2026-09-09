# MaxxIt — Fullständig kodbas-audit

**Datum:** 2026-09-09
**Omfattning:** `src/pages/` (17 filer), `src/components/` (28 filer), `src/lib/` + `src/hooks/` + `src/context/`, `supabase/functions/` (5 funktioner), `src/index.css` (4 749 rader), `supabase/migrations/`. Totalt ~26 800 rader.
**Metod:** manuell genomläsning + statisk analys (esbuild-parse av samtliga 77 JS/JSX-filer, selektor-/deklarationsanalys av CSS, import-graf, duplikatsökning).
**Inga kodändringar gjorda.**

> **Notering om verktyg:** `npx eslint .` hänger och dödades efter 5 min (exit 144) — samma RAM-beteende som full `vite build`. All analys nedan är därför egen statisk analys, inte lint-output.

---

## Innehåll

| Nivå | Antal | Beskrivning |
|---|---|---|
| [P0 — Kritiskt](#p0--kritiskt) | 8 | Fel data visas eller tyst dataförlust i produktion |
| [P1 — Hög](#p1--hög) | 9 | Krasch-, timeout-, kostnads- och prestandarisk |
| [P2 — Medel](#p2--medel) | 13 | Kända buggar B1–B9, inkonsekvens mellan komponenter |
| [P3 — Låg](#p3--låg) | 11 | Död kod, CSS-skuld, städning |

**Snabb sammanfattning av de kända buggarna:** B1 ✅ bekräftad (P0-4 + P2-1), B2 ✅ bekräftad (P2-4), B3 ✅ bekräftad och värre än väntat (P2-2), B4 ✅ bekräftad, rotorsak identifierad (P2-3), B5 ✅ bekräftad, tre separata defekter (P2-5), B6 ✅ bekräftad (P1-6), B7 ✅ bekräftad (P1-5), B8 ✅ bekräftad (P2-6), B9 ✅ bekräftad (P2-7).

---

## P0 — Kritiskt

### P0-1 · Resor-fliken i Ekonomi är permanent tom (status-vokabulär på svenska mot engelsk kanon)

- **Fil/plats:** [src/pages/Ekonomi.jsx:590](src/pages/Ekonomi.jsx#L590)
- **Vad är fel:** `.in('status', ['planerad', 'pågående'])`. Kanonisk vokabulär för `trips.status` är engelsk — `completed | planned | idea` — definierad i [Upplevelser.jsx:226-228](src/pages/Upplevelser.jsx#L226) och använd av [Jarvis.jsx:130](src/pages/Jarvis.jsx#L130) (`['planned','idea']`) samt edge-funktionens `create_trip` (default `'idea'`, [jarvis-chat/index.ts:640](supabase/functions/jarvis-chat/index.ts#L640)). Inga rader har någonsin statusen `planerad` eller `pågående`.
- **Varför det är ett problem:** Bugg. Frågan returnerar alltid 0 rader, `setTrips([])`, och hela Resor-fliken i Ekonomi visar "inga resor" oavsett hur många planerade resor användaren har. Ingen felkod, inget i konsolen — exakt samma klass av fel som `session_type`-buggen (svenska vs engelska), men i frontend.
- **Föreslagen fix:** Byt till `.in('status', ['planned', 'idea'])` och lyft ut `TRIP_STATUSES` till en delad konstant som Upplevelser, Ekonomi och Jarvis alla läser.
- **Risk att fixa:** Låg. ~2 rader + en konstant.

### P0-2 · Veckorapporten i Insights genereras helt utan data

- **Fil/plats:** [src/pages/Insights.jsx:406-414](src/pages/Insights.jsx#L406) mot [supabase/functions/jarvis-chat/index.ts:928](supabase/functions/jarvis-chat/index.ts#L928)
- **Vad är fel:** `generateWeeklyReport` skickar `context: JSON.stringify(data)` (hela dataobjektet: vikt-, sömn-, steg-, studie-, tränings-, inkomst-, PA-, PR-, tenta-, korrelations- och veckodagsserier för 90–365 dagar) **tillsammans med** en `systemPrompt`. I edge-funktionen gäller `const system = overrideSystem || buildSystemPrompt(context, …)` — när `systemPrompt` finns används `context` **aldrig**. Payloaden serialiseras, laddas upp och kastas.
- **Varför det är ett problem:** Bugg + kostnad. Modellen får bara meningen "Analysera min senaste vecka…" utan en enda datapunkt, och svarar därmed med generiska floskler — precis motsatsen till promptens "Var konkret och direkt". Samtidigt betalar man uppladdningen av hundratals kB JSON varje klick. Alla andra anropare (Journal, Plugg, StudyModal, Upplevelser) skickar korrekt `context: ''` och lägger data i meddelandet — Insights är den enda som gör fel.
- **Föreslagen fix:** Flytta den (kraftigt bantade) datasammanfattningen in i `messages[0].content` istället för `context`, precis som `generateObservations` redan gör på rad 359.
- **Risk att fixa:** Låg. Isolerad till en funktion.

### P0-3 · Anteckningar på inkomster försvinner — `notes` vs `description` i `income_logs`

- **Fil/plats:** [src/pages/Ekonomi.jsx:640](src/pages/Ekonomi.jsx#L640), [src/pages/Ekonomi.jsx:905](src/pages/Ekonomi.jsx#L905), [src/components/QuickLog.jsx:530](src/components/QuickLog.jsx#L530), [src/pages/Jobb.jsx:557](src/pages/Jobb.jsx#L557), [src/pages/Export.jsx:45](src/pages/Export.jsx#L45)
- **Vad är fel:** Samma tabell skrivs med två olika kolumner för samma sak. Ekonomi skriver `notes`, Jobb skriver `notes`, Jarvis `log_income` skriver `notes` — men QuickLog skriver `description`, och Export läser `description`. Transaktionslistan renderar `tx.description || tx.source || …`.
- **Varför det är ett problem:** Bugg. En inkomst du loggar via Ekonomis eget formulär visar **aldrig** din anteckning i listan (faller tillbaka på `source`), medan en inkomst från QuickLog gör det. Exporten tappar alla anteckningar från Ekonomi/Jobb/Jarvis. Data finns men är osynlig beroende på var den skrevs.
- **Föreslagen fix:** Välj `description` som kanon (matchar `expense_logs`), migrera `notes → description` och uppdatera de fyra skrivvägarna.
- **Risk att fixa:** Medel — kräver en datamigrering, annars enkelt.

### P0-4 · `somn`-tiern sparas aldrig i `tier_snapshots` → Jarvis ser aldrig sömn

- **Fil/plats:** [src/pages/Dashboard.jsx:921-931](src/pages/Dashboard.jsx#L921) mot [src/lib/jarvis/index.js:28-34](src/lib/jarvis/index.js#L28)
- **Vad är fel:** `todaySnap` skriver `kondition, styrka, plugg, ekonomi, valmående` — men **inte** `somn`, trots att kolumnen finns, läses tillbaka i `fetchAllData` (rad 306) och i `loadJarvisContext` (rad 108) och står i `SNAPSHOT_CATS` som en av sex kategorier.
- **Varför det är ett problem:** Bugg i intelligens-lagret. `reconstructFromSnapshot` filtrerar bort kategorier med `tier == null`, så Sömn saknas alltid i Jarvis MAXX-INTELLIGENS-block, i `computeMaxxScoreV2`-viktningen som körs där, och i bottleneck-detektionen. Jarvis kan alltså aldrig identifiera sömn som flaskhals — vilket är en av appens huvudpoänger.
- **Föreslagen fix:** Lägg till `somn: cats.find(c => c.id === 'somn')?.tier?.tier ?? null` i `todaySnap`.
- **Risk att fixa:** Låg. En rad.

### P0-5 · `user_settings.goals` skrivs av fyra oberoende ställen utan merge → lost updates

- **Fil/plats:** [src/pages/Settings.jsx:187-197](src/pages/Settings.jsx#L187), [src/pages/Halsa.jsx:188-194](src/pages/Halsa.jsx#L188), [src/pages/Traning.jsx:391-398](src/pages/Traning.jsx#L391), [src/components/Onboarding.jsx:108](src/components/Onboarding.jsx#L108)
- **Vad är fel:** `goals` är ett delat JSONB-objekt som innehåller `salary_day`, `csn_fribelopp`, `custom_exercises`, `active_supplements`, `target_weight`, `attachments` m.m. Settings skriver hela `goals` från state som lästes vid mount. Hälsa och Träning gör read-modify-write av samma objekt. Ingen merge, ingen optimistic concurrency.
- **Varför det är ett problem:** Tyst dataförlust. Sekvens: öppna Inställningar → gå till Hälsa och lägg till ett kosttillskott (skriver `active_supplements`) → tillbaka till Inställningar och spara → `active_supplements` raderas, eftersom Settings skriver sin gamla `goals`-kopia. Samma sak för `custom_exercises` från Träning och `salary_day` om något annat ställe skriver först. Ingen felmelding.
- **Föreslagen fix:** Läs om `goals` direkt före varje skrivning och spreada in fältändringen (`{ ...(fresh.goals || {}), salary_day, … }`), eller flytta `goals`-uppdateringar till en RPC som gör `jsonb_set` server-side.
- **Risk att fixa:** Medel. Fyra skrivställen, men mönstret finns redan i `Traning.saveCustomExercise`.

### P0-6 · QuickLog Journal skriver kolumner som inte finns i modellen — och sväljer felet

- **Fil/plats:** [src/components/QuickLog.jsx:535-539](src/components/QuickLog.jsx#L535)
- **Vad är fel:** `payload.highlights` och `payload.notes` skrivs till `journal_entries`. Ingen annan del av kodbasen skriver eller läser dessa fält — Journal-sidan använder `content`, och edge-funktionens `fetch_journal` läser `content`. Upserten har dessutom ingen `error`-kontroll: om kolumnerna saknas returnerar PostgREST 400 och `handleSave` fortsätter rakt in i `setSaved(true)`.
- **Varför det är ett problem:** Tyst dataförlust + falsk bekräftelse. Användaren ser den gröna bocken "Sparat" och antar att texten är sparad. Antingen försvinner texten helt (kolumnerna finns inte) eller hamnar i fält ingen läser (kolumnerna finns men är döda).
- **Föreslagen fix:** Skriv till `content` istället, och kontrollera `error` från upserten innan `setSaved(true)`.
- **Risk att fixa:** Låg.

### P0-7 · Motstridiga skrivmodeller mot `journal_entries` — insert vs upsert på (user_id, date)

- **Fil/plats:** [src/pages/Journal.jsx:194](src/pages/Journal.jsx#L194) mot [src/components/QuickLog.jsx:539](src/components/QuickLog.jsx#L539)
- **Vad är fel:** Journal-sidan gör `.insert()` och stödjer uttryckligen flera entries per dag (`fetchSelectedEntries` returnerar en lista, `selectedEntries.map(...)`). QuickLog gör `.upsert(payload, { onConflict: 'user_id,date' })`, vilket förutsätter en unik constraint på `(user_id, date)`. Båda kan inte vara sanna. Ingen migration i `supabase/migrations/` skapar den constrainten (basschemat är byggt utanför migrationskatalogen), så det går inte att verifiera i repot.
- **Varför det är ett problem:** Kraschrisk / tyst fel oavsett vilket som gäller. *Finns constrainten:* Journals andra entry samma dag misslyckas — och `saveEntry` gör `if (!error && data) { … }` utan else-gren, så formuläret bara står kvar utan felmeddelande. *Saknas constrainten:* QuickLogs upsert kastar `42P10 (no unique or exclusion constraint matching the ON CONFLICT specification)` — och felet sväljs enligt P0-6.
- **Föreslagen fix:** Bestäm en modell (rimligen: flera entries/dag tillåtna), gör om QuickLogs journalspar till `.insert()`, och lägg till en felgren i `Journal.saveEntry`.
- **Risk att fixa:** Medel — kräver ett beslut om datamodellen först.

### P0-8 · Samma tysta upsert-mönster på fem ytterligare skrivvägar

- **Fil/plats:** [QuickLog.jsx:442](src/components/QuickLog.jsx#L442) (health), [Halsa.jsx:143](src/pages/Halsa.jsx#L143) (`saveWidget`), [Halsa.jsx:152](src/pages/Halsa.jsx#L152) (`saveNutrition`), [Halsa.jsx:288](src/pages/Halsa.jsx#L288) (Apple Health-import), [Traning.jsx:884](src/pages/Traning.jsx#L884) (steg från "Annat"-pass), [Dashboard.jsx:932](src/pages/Dashboard.jsx#L932) (`tier_snapshots`, uttryckligen `.catch(() => {})`)
- **Vad är fel:** Alla upserts utan `error`-kontroll; flera följs direkt av `setSaved(true)` / en grön bock. `Halsa.saveWidget` är den mest exponerade — varje vikt-, sömn- och substanssparning går genom den.
- **Varför det är ett problem:** Tyst dataförlust med positiv återkoppling. Notera kontrasten: `Halsa.saveSupplements` och `Halsa.saveEditLog` gör det *rätt* (kontrollerar error, visar toast) — mönstret finns redan i samma fil, det är bara inte konsekvent applicerat. `tier_snapshots`-fallet är särskilt lömskt: om skrivningen tyst misslyckas slutar Jarvis intelligens-lager fungera (se P0-4) utan någon signal alls.
- **Föreslagen fix:** Destrukturera `{ error }` från varje upsert och visa `toast({ type: 'error' })` istället för `setSaved(true)`; byt `tier_snapshots`-fallets tomma `.catch()` mot en `console.warn`.
- **Risk att fixa:** Låg. Mekanisk ändring, mönstret finns redan i `saveEditLog`.

---

## P1 — Hög

### P1-1 · Strava-sync: N+1 + rate limit + timeout på första synken

- **Fil/plats:** [supabase/functions/strava-sync/index.ts:257-307](supabase/functions/strava-sync/index.ts#L257) och [:183-200](supabase/functions/strava-sync/index.ts#L183)
- **Vad är fel:** `sync` loopar över upp till 200 aktiviteter och gör per aktivitet: en `select`-existenskoll, en `insert`, och för varje löppass ett extra Strava-detaljanrop + `await sleep(120)` + N upserts. `fetch_prs` gör samma sak över *alla* Strava-löppass som någonsin synkats, utan tak.
- **Varför det är ett problem:** Prestandarisk + funktionellt avbrott. 200 löppass ≈ 200 × (detaljanrop ~300 ms + 120 ms sleep) ≈ 85 s enbart i väntan, plus 400+ DB-rundturer. Strava tillåter 100 requests / 15 min — en förstagångssync från en löpare spränger taket och avbryts halvvägs. Det finns ingen resume: nästa försök börjar om från början, och `fetch_prs` blir bara långsammare för varje synkat pass.
- **Föreslagen fix:** Hämta alla befintliga `strava_id` i **en** query till ett `Set`, batcha inserts som en array, och paginera best-efforts-hämtningen med en cursor (`after`-parameter) så varje anrop gör en avgränsad mängd arbete.
- **Risk att fixa:** Medel. Omskrivning av två loopar, men logiken är rak.

### P1-2 · CSV-import i Träning raderar all Strava-historik innan den vet om importen fungerar

- **Fil/plats:** [src/pages/Traning.jsx:490-495](src/pages/Traning.jsx#L490)
- **Vad är fel:** `handleCsvImport` kör `.delete().eq('source','strava')` — alltså allt — **före** parsningen, utan felkontroll och utan bekräftelsedialog. Därefter en `insert` per rad i en loop.
- **Varför det är ett problem:** Kraschrisk / dataförlust. Fel fil, fel kolumnrubriker, en kastad `parseCSVLine` eller en stängd flik mitt i loopen ⇒ all Strava-historik borta, inget importerat. Dessutom N+1: en Strava-export har ofta 1 000+ rader ⇒ 1 000 sekventiella rundturer.
- **Föreslagen fix:** Parsa och validera hela filen till en array först, radera först när minst en giltig rad finns, och `insert` arrayen i chunkar om ~500.
- **Risk att fixa:** Medel.

### P1-3 · CSV-parsern klarar inte det kommentaren påstår att den klarar

- **Fil/plats:** [src/pages/Traning.jsx:459-484](src/pages/Traning.jsx#L459)
- **Vad är fel:** Kommentaren säger *"Robust CSV parser handling quoted fields with commas/newlines"*, men rad 483 gör `text.split('\n')` **innan** `parseCSVLine` anropas. Ett citerat fält med radbrytning (vanligt i Stravas `Activity Description`) delas då mitt itu.
- **Varför det är ett problem:** Bugg + vilseledande kommentar. Efterföljande rader blir fältförskjutna, `vals[idx['Activity Date']]` pekar på skräp, och raden hoppas över eller importeras med fel datum — tyst, eftersom `skipped++` inte visas per rad. Kommentaren gör att nästa person inte misstänker parsern.
- **Föreslagen fix:** Tokenisera hela texten i ett svep med en citat-medveten state machine istället för att splitta på `\n` först.
- **Risk att fixa:** Låg–medel.

### P1-4 · Jarvis edge function: obegränsade tool-result-payloads i agentloopen

- **Fil/plats:** [supabase/functions/jarvis-chat/index.ts:1088-1103](supabase/functions/jarvis-chat/index.ts#L1088), tak satta i `asLimit` på [:369](supabase/functions/jarvis-chat/index.ts#L369), [:317](supabase/functions/jarvis-chat/index.ts#L317), [:585](supabase/functions/jarvis-chat/index.ts#L585)
- **Vad är fel:** Verktygsresultat läggs på `currentMessages` som råa strängar, i upp till 8 iterationer, utan någon storleksbegränsning. Taken är generösa: `fetch_journal` tillåter 200 entries × 1 000 tecken content ≈ 200 kB i **ett** verktygsanrop; `fetch_health` upp till 200 dagar + 400 kosttillskottsrader; `fetch_chat_history` 150 meddelanden × 400 tecken.
- **Varför det är ett problem:** Kostnads- och tillförlitlighetsrisk. En fråga som triggar journal + hälsa + chatthistorik kan bygga ett meddelandeträd på flera hundra kB som sedan skickas om vid *varje* efterföljande iteration — kostnaden växer kvadratiskt i loopen. Prompt-caching (rad 950-957) hjälper inte, eftersom cachen bara täcker `tools` + `system`, inte `messages`.
- **Föreslagen fix:** Klipp varje verktygsresultat till ett tak (t.ex. 20 000 tecken) med en explicit `…(trunkerat, N rader utelämnade)`-svans innan det läggs på `currentMessages`.
- **Risk att fixa:** Låg. En hjälpfunktion runt `executeTool`-returen.

### P1-5 · B7 — Insights AI-observationer: cachen är inte nycklad på period eller användare

- **Fil/plats:** [src/pages/Insights.jsx:335-347](src/pages/Insights.jsx#L335)
- **Vad är fel:** `sessionStorage.getItem('insights_obs')` — en fast nyckel, 30 min TTL. `generateObservations` anropas ovillkorligt i slutet av `fetchAll`, som körs på `[user, period]`.
- **Varför det är ett problem:** Bugg + kostnad. Byter du period från 90 d till 365 d visas 90-dagars-observationerna i upp till 30 minuter, märkta med den nya periodens rubrik. Loggar du ny data invalideras cachen inte alls. Loggar en annan användare in i samma flik ärver hen föregående användares observationer (sessionStorage är per flik, inte per session). Och när cachen väl missar fyras ett AI-anrop av vid varje periodbyte.
- **Föreslagen fix:** Nyckla cachen som `insights_obs:${user.id}:${period}` och rensa nycklarna vid utloggning.
- **Risk att fixa:** Låg.

### P1-6 · B6 — Jarvis kontext-cache invalideras aldrig efter skrivningar

- **Fil/plats:** [src/pages/Jarvis.jsx:80-81](src/pages/Jarvis.jsx#L80) och [:117-121](src/pages/Jarvis.jsx#L117)
- **Vad är fel:** `CONTEXT_TTL_MS = 5 min`. `sendToJarvis` anropar `refreshContext()` **utan** `force`, så cachen används oförändrat. Ingenting anropar `refreshContext(true)` efter att Jarvis själv skrivit data via `execute_action` (log_health, log_training, log_expense…), och ingenting invalideras när QuickLog eller Hälsa skriver från en annan sida.
- **Varför det är ett problem:** Bugg. Säger du "logga 8 h sömn" och direkt därefter "hur ser min hälsa ut idag?" svarar Jarvis utifrån kontexten *före* skrivningen och påstår att inget är loggat. Kontexten innehåller dessutom `TID: <datum, HH:mm>`, som blir upp till 5 minuter fel. Sekundärt: varje cache-miss kör `loadJarvisContext` som läser snapshot + kör `computeMaxxScoreV2`/`detectBottlenecksV2`/`buildRankUpLayer` på nytt.
- **Föreslagen fix:** Sätt `contextCacheTimeRef.current = 0` när svaret innehåller `savedMemory` eller när ett `execute_action` kördes, och plocka ut tidsstämpeln ur den cachade strängen så den beräknas per anrop.
- **Risk att fixa:** Låg.

### P1-7 · Apple Health-import läser hela XML:en i minnet och gör en rundtur per dag

- **Fil/plats:** [src/pages/Halsa.jsx:262-295](src/pages/Halsa.jsx#L262)
- **Vad är fel:** `await file.text()` + `new DOMParser().parseFromString(text, 'text/xml')` + `querySelectorAll('Record')` på hela filen, följt av en `upsert` per datum i en loop.
- **Varför det är ett problem:** Kraschrisk + prestanda. En Apple Health-export (`export.xml`) är regelmässigt 200 MB–1 GB; sträng + DOM-träd ⇒ flera GB heap ⇒ fliken kraschar innan något importeras. Klarar den parsningen blir det sedan en rundtur per dag — flera års data ⇒ 1 000+ sekventiella requests. Ingen `error`-kontroll (se P0-8), och `count` (rad 288) inkrementeras men läses aldrig.
- **Föreslagen fix:** Strömma filen och matcha `<Record …/>` inkrementellt (eller regex över chunkar) istället för DOMParser, och batcha upserterna i chunkar om ~500.
- **Risk att fixa:** Medel–hög. Kräver omskrivning av parsningen.

### P1-8 · Token refresh utan felkontroll i båda OAuth-funktionerna

- **Fil/plats:** [strava-sync/index.ts:148-165](supabase/functions/strava-sync/index.ts#L148) och [:213-232](supabase/functions/strava-sync/index.ts#L213)
- **Vad är fel:** `const refreshed = await res.json()` — `res.ok` kontrolleras aldrig. Vid ett misslyckat refresh blir `accessToken = undefined`, och `new Date(refreshed.expires_at * 1000)` blir `Invalid Date` som skrivs till `strava_tokens.expires_at`.
- **Varför det är ett problem:** Bugg. Alla efterföljande Strava-anrop 401:ar tyst (loopen bara `console.warn`:ar), användaren ser "synkade 0 pass" utan förklaring, och den korrupta `expires_at` gör att nästa försök också går fel väg. `google-calendar-sync` gör det bättre (`if (!accessToken) throw`), men hårdkodar 1 h istället för att använda `expires_in` ([:151](supabase/functions/google-calendar-sync/index.ts#L151)).
- **Föreslagen fix:** `if (!res.ok || !refreshed.access_token) return 401 'reauthorize'` innan token skrivs.
- **Risk att fixa:** Låg.

### P1-9 · Context-värden är omemoiserade objekt-literaler → hela appen renderar om vid varje toast

- **Fil/plats:** [src/context/ToastContext.jsx:21](src/context/ToastContext.jsx#L21), [src/context/AuthContext.jsx:79](src/context/AuthContext.jsx#L79)
- **Vad är fel:** `value={{ toast, dismiss }}` respektive `value={{ user, loading, signIn, … }}` skapas på nytt vid varje render av providern. `ToastProvider` har egen `toasts`-state och renderar alltså om vid varje visad *och* varje avfärdad toast.
- **Varför det är ett problem:** Prestandarisk. Varje `useToast()`-konsument renderas om två gånger per toast — inklusive Dashboard (1 161 rader, tunga `useMemo`-kedjor och 12 parallella queries i `fetchAllData`) och Träning (2 380 rader). En "Sparat"-toast triggar alltså en full omrendering av den tyngsta sidan i appen.
- **Föreslagen fix:** Wrappa båda `value`-objekten i `useMemo` med rätt beroenden (`toast`/`dismiss` är redan `useCallback`-stabila).
- **Risk att fixa:** Låg. Två rader.

---

## P2 — Medel

### P2-1 · B1 — `energy` / `energy_level` normaliseras inte konsekvent

- **Fil/plats:** Läsare som **saknar** fallback: [Insights.jsx:137](src/pages/Insights.jsx#L137) (`select('…,energy')`), [Export.jsx:27](src/pages/Export.jsx#L27) (`select('…, energy, …')`). Läsare som **har** fallback: [Dashboard.jsx:657](src/pages/Dashboard.jsx#L657), [:911](src/pages/Dashboard.jsx#L911), [:972](src/pages/Dashboard.jsx#L972), [Jarvis.jsx:136](src/pages/Jarvis.jsx#L136), [WeeklyReview.jsx:63](src/components/WeeklyReview.jsx#L63), [jarvis-chat/index.ts:326](supabase/functions/jarvis-chat/index.ts#L326).
- **Vad är fel:** Skrivarna är redan normaliserade — QuickLog ([:440](src/components/QuickLog.jsx#L440)), Journal ([:207](src/pages/Journal.jsx#L207)) och Jarvis `log_health` ([:681-682](supabase/functions/jarvis-chat/index.ts#L681)) skriver alla **båda** fälten. Men äldre rader (Apple Health-import, tidigare versioner) har bara det ena, och två läsare saknar `?? `-fallbacken.
- **Varför det är ett problem:** Bugg. Insights sömn→energi-korrelation och veckodagsanalysen tappar alla `health_logs`-rader som bara har `energy_level`; exporten likaså. Resultatet är korrelationer beräknade på delmängder utan att det syns.
- **Föreslagen fix:** Lägg `energy_level` i båda `select`-satserna och normalisera med `r.energy_level ?? r.energy` direkt efter hämtning; alternativt en engångsmigrering som fyller i det saknade fältet, och därefter en enda kanonisk kolumn.
- **Risk att fixa:** Låg (frontend) / Medel (om kolumnen ska konsolideras).

### P2-2 · B3 — Övningsbiblioteket finns i tre inkompatibla versioner, och PR-logiken i två

- **Fil/plats:** [src/components/QuickLog.jsx:17-24](src/components/QuickLog.jsx#L17) (hårdkodad kopia), [src/pages/Traning.jsx:14-22](src/pages/Traning.jsx#L14) (`BASE_EXERCISE_LIBRARY` + `'Egna'` från `user_settings.goals.custom_exercises` + historik), [src/pages/Traning.jsx:111](src/pages/Traning.jsx#L111) (`libraryExercises` från DB-vyn `exercise_library_with_muscles`).
- **Vad är fel:** QuickLogs `EXERCISE_LIBRARY` är en ordagrann kopia av `BASE_EXERCISE_LIBRARY` **minus** `'Egna'` — den ser aldrig användarens egna övningar, varken från `goals.custom_exercises` eller från `exercise_library`. Inuti Träning finns dessutom två parallella bibliotek: det gamla objekt-baserade (som passväljaren använder) och det nya DB-baserade med `is_bodyweight`, `measurement_type`, alias och muskelgrupper (som bara Bibliotek-fliken använder).
- **Varför det är ett problem:** Teknisk skuld med direkt datakonsekvens. Värre: PR-uppdateringen skiljer sig helt mellan de två inmatningsvägarna. Träning ([:757-825](src/pages/Traning.jsx#L757)) hanterar BW-övningar med Epley-liknande `r × (1 + w/30)` och select-then-update. QuickLog ([:495-511](src/components/QuickLog.jsx#L495)) tittar bara på `maxWeight`, ignorerar reps och BW helt, och kör `upsert(onConflict:'user_id,exercise_name')`. Ett pull-up-set med +20 kg loggat via QuickLog skriver `weight_kg: 20` **utan reps** — vilket sedan får Tränings BW-jämförelse (`existingReps * (1 + existingWeight/30)`) att räkna på `reps = 0`, och nästa riktiga PR bedöms fel.
- **Föreslagen fix:** Låt QuickLog importera samma bibliotek och samma PR-funktion från Träning (eller från en delad `src/lib/`-modul) istället för att duplicera dem.
- **Risk att fixa:** Medel. Kräver att PR-logiken lyfts ut till en funktion — utan att dela upp någon komponentfil.

### P2-3 · B4 — BW-detektion via hårdkodad `toLowerCase()`-lista istället för DB-flaggan `is_bodyweight`

- **Fil/plats:** `BW_EXERCISES` definieras på [Traning.jsx:25-31](src/pages/Traning.jsx#L25) och slås upp på [:763](src/pages/Traning.jsx#L763), [:1336](src/pages/Traning.jsx#L1336), [:1791](src/pages/Traning.jsx#L1791), [:2350](src/pages/Traning.jsx#L2350), [:2356](src/pages/Traning.jsx#L2356).
- **Vad är fel:** Själva matchningen (`.toLowerCase().trim()` mot ett lowercase-`Set`) är korrekt. Problemet är att listan är den *enda* sanningen: `exercise_library.is_bodyweight` finns i schemat, redigeras i UI:t ([:1987](src/pages/Traning.jsx#L1987)), sparas ([:315](src/pages/Traning.jsx#L315), [:359](src/pages/Traning.jsx#L359)) — och läses aldrig av något av de fem BW-beslutsställena.
- **Varför det är ett problem:** Bugg. En egen övning ("Ring muscle-up", "Nordic curl") som användaren kryssar i som kroppsvikt visar fortfarande "Kg" istället för "+Kg", får fel platshållare, och PR:et beräknas med styrke-grenen (`bestWeight > existing.weight_kg`) istället för BW-grenen — så ett set på 12 reps med 0 kg registrerar aldrig ett PR. Listan är också ofullständig även för standardövningar (`situps`, `crunches`, `bäckenlyft` saknas trots att de finns i biblioteket).
- **Föreslagen fix:** Gör en hjälpfunktion `isBodyweight(name)` som först slår upp `findLibraryExerciseByName(name)?.is_bodyweight` och faller tillbaka på `BW_EXERCISES`, och använd den på alla fem ställena.
- **Risk att fixa:** Låg. En funktion + fem anropsställen.

### P2-4 · B2 — 'Marocko' finns två gånger i `COUNTRIES` → duplicerad React-key

- **Fil/plats:** [src/pages/Upplevelser.jsx:25](src/pages/Upplevelser.jsx#L25) (Mellanöstern-blocket) och [:29](src/pages/Upplevelser.jsx#L29) (Afrika-blocket)
- **Vad är fel:** Verifierat: listan har 79 poster, 78 unika — `Marocko` är den enda dubletten.
- **Varför det är ett problem:** Bugg + konsollarm. `CountryPicker` renderar med `key={c}` ([:369](src/pages/Upplevelser.jsx#L369)), så React varnar för duplicerad nyckel; båda raderna markeras samtidigt eftersom `selected.includes(c)` är sant för båda, och räknaren i footern ("79 länder") är fel.
- **Föreslagen fix:** Ta bort `'Marocko'` från Afrika-raden (behåll den i Mellanöstern-blocket där landet redan har flagga och koordinat).
- **Risk att fixa:** Låg. En token.

### P2-5 · B5 — `salaryDay` har tre separata defekter

- **Fil/plats:** [src/pages/Ekonomi.jsx:515](src/pages/Ekonomi.jsx#L515), [:531-547](src/pages/Ekonomi.jsx#L531), [:597-598](src/pages/Ekonomi.jsx#L597); parallell implementation i [src/pages/Dashboard.jsx:274-280](src/pages/Dashboard.jsx#L274)
- **Vad är fel:**
  1. **Dubbelhämtning + fel första render.** `salaryDay` initieras till `25`. `settingsRes` läses *inuti* `fetchAll`, som körs av en effekt med `[user, selectedMonth, salaryDay]` i beroendelistan. Första körningen använder alltså alltid 25 (fel period, fel siffror målas ut), sedan `setSalaryDay(saved)` ⇒ effekten kör om ⇒ hela `fetchAll` (6 queries) körs två gånger vid varje mount.
  2. **Månadsöverflöde för dag 29–31.** `new Date(year, startMonth + 1, day - 1)` med `day = 31` och februari som startmånad ger `new Date(y, 1, 31)` = 3 mars. Periodgränserna blir fel för alla löndagar > 28.
  3. **Två oberoende implementationer.** Dashboard beräknar samma period med egen kod (`todayNum < salaryDay ? month-1 : month`, egen `|| 25`) utan överflödesskydd — de kan alltså visa olika perioder samtidigt.
- **Varför det är ett problem:** Bugg + prestanda. Fel period ⇒ fel inkomst-/utgiftssummor i både Ekonomi och Dashboards PA-widget.
- **Föreslagen fix:** Hämta `salary_day` i en egen effekt före `fetchAll` (eller sätt state innan första fetch), klampa dagen med `Math.min(day, sista dagen i månaden)`, och lyft `getSalaryPeriod` till `src/lib/` så Dashboard använder samma funktion.
- **Risk att fixa:** Medel. Rör två sidor och en effektkedja.

### P2-6 · B8 — Journal-AI triggas inte vid redigering, och guarden jämför fel entry

- **Fil/plats:** [src/pages/Journal.jsx:208-217](src/pages/Journal.jsx#L208) (insert-grenen), [:163-190](src/pages/Journal.jsx#L163) (update-grenen)
- **Vad är fel:** Två separata defekter.
  1. **Update-grenen anropar aldrig `runAIAnalysis`.** Skriver du om en entry helt behåller den sin gamla `ai_summary`, `ai_extracted_people` och `ai_extracted_keywords` för alltid.
  2. **Guarden i insert-grenen jämför mot fel rad.** `selectedEntries.find(e => e.date === dateStr)` hämtades *före* insert och innehåller alltså inte den nya raden — den hittar en *annan* entry från samma dag. Har den ett `ai_summary` och liknande längd blir `contentChangedSignificantly` falskt, och den helt nya entryn analyseras aldrig.
- **Varför det är ett problem:** Bugg. Entries hamnar i "oanalyserad"-limbo utan att synas i `unanalyzedCount` (som filtrerar på `ai_summary is null` — men den gamla entryns summary finns kvar på fel rad). Sekundärt: `form.skills` sparas bara i insert-grenen och `openEditForm` fyller inte i `skills` alls, så redigering nollställer färdighetsloggen i UI:t.
- **Föreslagen fix:** Anropa `runAIAnalysis(editingEntry.id, form.content)` i update-grenen när `form.content` ändrats, och ta bort guarden i insert-grenen (en nyskapad entry har per definition ingen analys).
- **Risk att fixa:** Låg.

### P2-7 · B9 — CountryPicker: död positioneringskod och hårdkodade mörka färger

- **Fil/plats:** [src/pages/Upplevelser.jsx:259](src/pages/Upplevelser.jsx#L259), [:270-276](src/pages/Upplevelser.jsx#L270), [:295](src/pages/Upplevelser.jsx#L295), [:318](src/pages/Upplevelser.jsx#L318)
- **Vad är fel:** Två saker.
  1. **`dropRect` är död kod.** `useState(null)` + `setDropRect(triggerRef.current.getBoundingClientRect())` i `handleOpen` — värdet läses aldrig någonstans. Uppenbarligen en påbörjad portal-/fixed-positionering som aldrig slutfördes; dropdownen är fortfarande `position: absolute` inuti modalen och klipps av dess `overflow`.
  2. **Hårdkodade mörka färger.** `background: 'rgba(20,24,36,0.95)'` på triggern, `background: '#1a2035'` på panelen, `color: '#f1f5f9'` på text — trots att appen har ett fullt ljust tema (`html[data-theme="light"]`, [ThemeContext.jsx](src/context/ThemeContext.jsx)).
- **Varför det är ett problem:** UX-bugg. I ljust tema blir landväljaren en mörk plåster mitt i ett ljust formulär. Och i modalen klipps listan (max-height 260 px + footer) av föräldern.
- **Föreslagen fix:** Antingen använd `dropRect` till en `position: fixed`-dropdown renderad i en portal, eller ta bort `dropRect` helt; byt de tre hårdkodade färgerna mot `var(--surface)`, `var(--surface2)` och `var(--text)`.
- **Risk att fixa:** Låg (färgerna) / Medel (positioneringen).

### P2-8 · Fyra inkompatibla `SectionHeader` och en oanvänd `StatusChip`

- **Fil/plats:** [src/components/ui/SectionHeader.jsx](src/components/ui/SectionHeader.jsx) (ny, otrackad), [src/pages/Profile.jsx:16](src/pages/Profile.jsx#L16), [src/pages/Insights.jsx:40](src/pages/Insights.jsx#L40), [src/pages/Settings.jsx:68](src/pages/Settings.jsx#L68)
- **Vad är fel:** Fyra komponenter med samma namn och oförenliga props: den delade tar `{title, sub, kicker, label, actions}`, Profile och Settings tar `{icon, title, subtitle}`, Insights tar `{title, color}`. Endast Dashboard importerar den delade. Samma sak för `StatusChip` — den delade komponenten finns men bara Dashboard använder den; övriga sidor bygger chips inline.
- **Varför det är ett problem:** Teknisk skuld + visuell drift. Fyra rubrikstilar som ser olika ut på olika sidor och driftar isär vid varje designändring. Den nya `ui/`-mappen är alltså påbörjad men inte utrullad.
- **Föreslagen fix:** Utöka den delade `SectionHeader` med en valfri `icon`-prop och byt de tre lokala definitionerna mot importen — inga filer delas upp, tre lokala funktioner tas bort.
- **Risk att fixa:** Låg–medel. Mekaniskt men rör tre stora filer.

### P2-9 · `TIER_COLORS` finns i sju kopior — och de har redan driftat isär

- **Fil/plats:** [tierUtils.js](src/components/dashboard/tierUtils.js) (kanon, exporteras), [KpiTree.jsx:3](src/components/dashboard/KpiTree.jsx#L3), [CategoryCard.jsx:3](src/components/dashboard/CategoryCard.jsx#L3), [DetailModal.jsx:7](src/components/dashboard/DetailModal.jsx#L7), [DashboardConstellation.jsx:6](src/components/dashboard/DashboardConstellation.jsx#L6), [FocusView.jsx:6](src/components/dashboard/FocusView.jsx#L6), [achievements.js:4](src/lib/achievements.js#L4)
- **Vad är fel:** Sex lokala kopior utöver den exporterade. De är redan olika: tier 0 är `rgba(255,255,255,0.15)` i CategoryCard och DashboardConstellation, men `0.18` i KpiTree, DetailModal och FocusView. `achievements.js` saknar tier 0 och 1 helt.
- **Varför det är ett problem:** Teknisk skuld med synlig effekt. Samma tier ritas i olika nyanser beroende på vilken vy man tittar i. Samma mönster: `CAT_PATHS` (SVG-ikoner) finns i tre kopior, `DEFAULT_SUPPLEMENTS` i två ([Dashboard.jsx:41](src/pages/Dashboard.jsx#L41), [Halsa.jsx:12](src/pages/Halsa.jsx#L12)).
- **Föreslagen fix:** Importera `TIER_COLORS`/`CAT_PATHS` från `tierUtils.js` i alla sex filerna och ta bort de lokala kopiorna.
- **Risk att fixa:** Låg.

### P2-10 · Livsfas-multiplikatorerna för ekonomi-tier finns i två filer som redan räknar olika

- **Fil/plats:** [src/lib/tierEngine.js:147-151](src/lib/tierEngine.js#L147) (`ECON_LIFE_STAGE`) och [src/lib/benchmarks/datasets.js:49-53](src/lib/benchmarks/datasets.js#L49) (`ECON_STAGE`)
- **Vad är fel:** Tabellerna är ordagrant identiska, men **ålderfaktorn** runt dem skiljer sig: `tierEngine.econAgeFactor` mot `datasets.js`-varianten `clamp(ctx.age / 35, 0.4, 1.4)` (som dessutom hoppar över `income`).
- **Varför det är ett problem:** Teknisk skuld i själva poängsystemet. Tiern som tilldelas (tierEngine) och percentilen som visas bredvid den (benchmarks) kan säga olika saker om samma användare — och en framtida justering av multiplikatorerna kommer nästan säkert bara göras på ett ställe.
- **Föreslagen fix:** Exportera `ECON_LIFE_STAGE` från `tierEngine.js` och importera den i `datasets.js`; harmonisera ålderfaktorn eller dokumentera varför de medvetet skiljer sig.
- **Risk att fixa:** Medel — rör poängberäkningen, kräver verifiering mot befintliga snapshots.

### P2-11 · `NEXT_TIER_SHORT` hårdkodar trösklar som `tierEngine` beräknar profilanpassat

- **Fil/plats:** [src/components/dashboard/CategoryCard.jsx:9-18](src/components/dashboard/CategoryCard.jsx#L9)
- **Vad är fel:** Strängar som `'Bänk ≥ 0.75x BW'`, `'Netto ≥ 12 000 kr/mån'`, `'5km < 28:00'` är statiska. `tierEngine.js` justerar däremot trösklarna efter kön, ålder, livsfas, land och valuta.
- **Varför det är ett problem:** Bugg för alla utom standardprofilen. En kvinnlig användare, eller en med `life_stage: 'student'` (multiplikator 0.35 på inkomst), får ett "nästa tier"-mål som inte alls motsvarar vad systemet faktiskt kräver — kortet lovar något annat än poängmotorn levererar.
- **Föreslagen fix:** Bygg strängen från `c.levelUp`/`rankUp.plans` som redan innehåller det profilanpassade målet, istället för att slå upp i den statiska tabellen.
- **Risk att fixa:** Medel.

### P2-12 · Ångra-radering är beroende av att sidan förblir monterad i 5 sekunder

- **Fil/plats:** [src/pages/Traning.jsx:597-611](src/pages/Traning.jsx#L597) (`deleteSession`), [src/pages/Journal.jsx:230-249](src/pages/Journal.jsx#L230) (`deleteEntry`)
- **Vad är fel:** Raden tas bort ur state direkt; själva `supabase.delete()` körs i en `setTimeout(…, 5000)` som varken avbryts vid unmount eller körs vid unmount.
- **Varför det är ett problem:** Bugg. Navigerar användaren bort, laddar om eller stänger fliken inom 5 s ser posten borttagen ut men finns kvar i databasen — och dyker upp igen nästa gång sidan öppnas. Journal-varianten anropar dessutom `fetchMonthEntries()` efter timeouten, alltså `setState` på en potentiellt avmonterad komponent.
- **Föreslagen fix:** Radera direkt i DB och återinsätt raden vid "Ångra" (soft-delete-flagga eller re-insert), alternativt spara timeout-id:t i en ref och kör raderingen i en `useEffect`-cleanup.
- **Risk att fixa:** Medel.

### P2-13 · Kalenderhämtningen i Jarvis tappar sista dagen i fönstret

- **Fil/plats:** [supabase/functions/jarvis-chat/index.ts:483](supabase/functions/jarvis-chat/index.ts#L483)
- **Vad är fel:** `.lte('starts_at', to)` jämför en `timestamptz`-kolumn med en ren datumsträng `'YYYY-MM-DD'`, som tolkas som midnatt. Alla events *under* slutdagen faller utanför. `mandatory_sessions` och `pa_shifts` i samma anrop använder `date`-kolumner och påverkas inte.
- **Varför det är ett problem:** Bugg. Frågar man "vad händer de närmaste 14 dagarna" utelämnas hela dag 14 för schemalagda events — men inte för obligatoriska moment eller PA-pass, så svaret blir internt inkonsekvent utan att det syns.
- **Föreslagen fix:** `.lte('starts_at', to + 'T23:59:59')`, som `fetch_chat_history` redan gör på rad 584.
- **Risk att fixa:** Låg. En rad.

---

## P3 — Låg

### P3-1 · CSS: 53 selektorer definieras om, 294 deklarationer är fullständigt överskuggade

- **Fil/plats:** [src/index.css](src/index.css) — värst: `.page-header` (12 block: rad 830, 865, 1223, 1265, 1419, 1667, 1895, 2121, 2262, 2414, 2497, 2556), `.page-header h2` (9), `.sigge-main-scroll` (9), `.dashboard-wrap` (6), `.page-header-sub` (6), `.page-header::before` / `::after` (6 vardera)
- **Vad är fel:** Mätt över filen: 296 regler totalt, varav 53 selektorer förekommer i flera block **i samma media-kontext**. 294 enskilda deklarationer skrivs över av ett senare block och har alltså noll effekt. Exempel på `.page-header`: `min-height` sätts på rad 831 (76px), 1423 (92px), 1900 (92px) och 2263 (86px) — bara den sista gäller; `padding` sätts fyra gånger, `background` tre gånger. Dessutom 628 `!important` i filen, vilket gör att specificitet inte längre kan användas för att lösa konflikter — bara källordning.
- **Varför det är ett problem:** Teknisk skuld med hög felrisk. Ändrar man `.page-header` på det första stället händer ingenting, vilket driver fram *ännu* ett block längre ner — det är precis så filen växte till 4 749 rader. Varje framtida stiländring blir en gissningslek.
- **Föreslagen fix:** Slå ihop varje upprepad selektor **in i sitt första (kanoniska) block på plats** och radera de senare blocken — flytta inget till slutet av filen och lägg inte till nya block där. Börja med `.page-header`-familjen (37+21+19+18+18 = 113 av de 294 döda deklarationerna).
- **Risk att fixa:** Hög. Kräver visuell verifiering per sida via dev-servern på 1440px (full build hänger). Gör en selektor i taget.

### P3-2 · CSS: hela `.route-*`-kaskaden är död

- **Fil/plats:** [src/index.css:1542-1560](src/index.css#L1542) och [:2373-2390](src/index.css#L2373)
- **Vad är fel:** Två stora block med `.route-dashboard`, `.route-traning`, `.route-kalender`, `.route-upplevelser`, `.route-journal`, `.route-halsa`, `.route-ekonomi`, `.route-jobb`, `.route-plugg`, `.route-insights`, `.route-export`, `.route-installningar`, `.route-jarvis`. Sökning i hela `src/` och `index.html`: ingen av dessa klasser sätts någonsin — inte statiskt i JSX, inte via `classList.add` (de enda anropen finns i ThemeContext/useBackground och sätter `has-bg-image` + blur-klasser), inte via template-literal.
- **Varför det är ett problem:** Död kod som ser levande ut. Blocken styr `padding` på `.page-content-scroll > div` och läser som om de vore aktiva sidlayout-regler — de är det inte, vilket är en fälla för nästa layoutändring.
- **Föreslagen fix:** Ta bort båda blocken (eller sätt faktiskt `route-*`-klassen på wrappern i `AppLayout` om regeln var avsedd att gälla).
- **Risk att fixa:** Låg. Regeln är bevisat inaktiv.

### P3-3 · CSS: `@keyframes spin` duplicerad i fyra inline `<style>`-taggar

- **Fil/plats:** [src/index.css:460](src/index.css#L460) (global, korrekt) samt [Insights.jsx:820](src/pages/Insights.jsx#L820), [Traning.jsx:2040](src/pages/Traning.jsx#L2040), [Export.jsx:250](src/pages/Export.jsx#L250), [Upplevelser.jsx:1258](src/pages/Upplevelser.jsx#L1258)
- **Vad är fel:** `@keyframes spin` finns redan globalt i index.css. Fyra sidor renderar dessutom en identisk `<style>{`…`}</style>` i sin JSX. Tio andra filer (Halsa, Journal, QuickLog, Settings, Jobb, Plugg, Kalender, Profile, Ekonomi, StudyModal) använder `animation: 'spin 1s…'` **utan** en egen `<style>` — och fungerar, vilket bevisar att de fyra inline-taggarna är överflödiga.
- **Varför det är ett problem:** Teknisk skuld. Fyra identiska definitioner injiceras i `<head>` vid varje mount. Ofarligt men vilseledande — det ser ut som att animationen kräver den lokala taggen.
- **Föreslagen fix:** Ta bort de fyra `<style>`-taggarna.
- **Risk att fixa:** Låg.

### P3-4 · Fyra helt oanvända filer (568 rader)

- **Fil/plats:** [src/lib/career.js](src/lib/career.js) (284 rader), [src/lib/profileTemplates.js](src/lib/profileTemplates.js) (105), [src/hooks/useBackground.js](src/hooks/useBackground.js) (95), [src/components/dashboard/FocusView.jsx](src/components/dashboard/FocusView.jsx) (84)
- **Vad är fel:** Ingen fil i `src/` importerar dem. `FocusView.jsx` är sannolikt föräldralös efter commiten *"remove Fokusläge"*. `useBackground.js` duplicerar dessutom `applyBg`-logiken i [ThemeContext.jsx:31-56](src/context/ThemeContext.jsx#L31) rad för rad.
- **Varför det är ett problem:** Teknisk skuld. `useBackground.js` är farligast — den ser ut som den aktiva bakgrundsimplementationen och kan lockas att ändras istället för ThemeContext.
- **Föreslagen fix:** Radera alla fyra.
- **Risk att fixa:** Låg. Verifierat att ingenting importerar dem.

### P3-5 · Oanvända imports

- **Fil/plats:** [src/pages/Dashboard.jsx:16-21](src/pages/Dashboard.jsx#L16) — `getStudyTier`, `estimateVO2max`, `VO2MAX_THRESHOLDS`, `RUN_MARA_THRESHOLDS`, `STRESS_THRESHOLDS`, `STEPS_THRESHOLDS`. [src/pages/Jobb.jsx:7-11](src/pages/Jobb.jsx#L7) — `ChevronDown`, `ChevronUp`, `DollarSign`, `Edit2`, `FileText`, `MessageSquare`, `Tag`.
- **Vad är fel:** 13 oanvända symboler. Dashboards är talande: `estimateVO2max` och `getStudyTier` importeras fortfarande fast beräkningen flyttat till `tierEngine.calculateConditioningTier` respektive `studies.computeStudiesTier`.
- **Varför det är ett problem:** Teknisk skuld. De sju lucide-ikonerna drar in ikonmoduler i bundlen i onödan, och de gamla tier-funktionerna antyder felaktigt att de fortfarande är i bruk.
- **Föreslagen fix:** Ta bort raderna. (Kan inte fångas av `npm run lint` idag — se noteringen överst.)
- **Risk att fixa:** Låg.

### P3-6 · `checkStravaStatus` gör två anrop där ett räcker

- **Fil/plats:** [src/pages/Traning.jsx:389-405](src/pages/Traning.jsx#L389)
- **Vad är fel:** Funktionen anropar först `supabase.functions.invoke('strava-sync', { headers: { 'x-action': 'status' } })` och destrukturerar `{ data, error }` — som sedan aldrig läses. Direkt därefter kommer en rå `fetch` mot samma endpoint med `?action=status`, och det är den som används. En kvarglömd kommentar (`// Use query param approach instead`) bekräftar att det första anropet skulle ha tagits bort.
- **Varför det är ett problem:** Prestandarisk (mild) + död kod. Två edge function-invokationer vid varje mount av Träning-sidan; den första saknar dessutom `action` och faller igenom till `'Unknown action'` (400).
- **Föreslagen fix:** Ta bort `invoke`-anropet och kommentaren.
- **Risk att fixa:** Låg.

### P3-7 · PII i edge function-loggar

- **Fil/plats:** [google-calendar-sync/index.ts:164](supabase/functions/google-calendar-sync/index.ts#L164), [:227](supabase/functions/google-calendar-sync/index.ts#L227), [:232](supabase/functions/google-calendar-sync/index.ts#L232)
- **Vad är fel:** `console.log('PA event titles:', paEvents.map(e => e.summary).join(', '))`, `'Sample titles:'` och `'Mandatory titles:'` skriver användarens kalenderhändelsetitlar rakt in i funktionsloggen.
- **Varför det är ett problem:** Integritetsrisk. Kalendertitlar kan innehålla klientnamn, vårdbesök och privata händelser, och Supabase-loggar har annan åtkomstkontroll och retention än RLS-skyddade tabeller. Detta blir mer relevant nu när appen är multi-user (fas 16).
- **Föreslagen fix:** Logga antal istället för innehåll (`console.log('PA events:', paEvents.length)`).
- **Risk att fixa:** Låg.

### P3-8 · Edge function: N+1-upserts i kalendersynken

- **Fil/plats:** [google-calendar-sync/index.ts:169-187](supabase/functions/google-calendar-sync/index.ts#L169) och [:259-292](supabase/functions/google-calendar-sync/index.ts#L259)
- **Vad är fel:** En `upsert` per event i en loop, för både `pa_shifts` och `mandatory_sessions`. `synced++` räknas upp även när upserten returnerar `error`. `mandatory`-grenens fallback-existenskoll använder `.single()`, som returnerar ett fel vid 0 träffar (det förväntade fallet).
- **Varför det är ett problem:** Prestandarisk + felaktig statistik. Med 12 månader bakåt och 12 framåt kan det bli hundratals rundturer, och det rapporterade `synced`-antalet överdriver hur mycket som faktiskt sparades.
- **Föreslagen fix:** Bygg en array och gör en `upsert(rows, { onConflict: 'user_id,google_event_id' })`; byt `.single()` mot `.maybeSingle()`; räkna bara upp `synced` när `error` är null.
- **Risk att fixa:** Låg–medel.

### P3-9 · Felaktig SECURITY-kommentar i jarvis-chat

- **Fil/plats:** [supabase/functions/jarvis-chat/index.ts:922-925](supabase/functions/jarvis-chat/index.ts#L922)
- **Vad är fel:** Kommentaren lyder *"this runs on the SERVICE-ROLE client, which bypasses RLS, so the user scope MUST be applied explicitly here"*. Blocket använder i själva verket `supabase` = `userClient` från `getAuthedUser` — en per-request JWT-klient under RLS, precis som kommentaren 20 rader ovanför korrekt beskriver.
- **Varför det är ett problem:** Teknisk skuld / framtida felkälla. Koden är säker idag (`.eq('user_id', user.id)` finns), men kommentaren beskriver fel säkerhetsmodell och kan få nästa läsare att dra fel slutsats åt endera hållet.
- **Föreslagen fix:** Uppdatera kommentaren till att beskriva RLS-klienten och att `.eq('user_id', …)` är defense-in-depth.
- **Risk att fixa:** Låg. Endast kommentar.

### P3-10 · Mutationer utan `user_id`-filter (härdning, inte hål)

- **Fil/plats:** ~25 ställen, bl.a. [StudyModal.jsx:148](src/components/StudyModal.jsx#L148), [Kalender.jsx:205](src/pages/Kalender.jsx#L205), [Jobb.jsx:492](src/pages/Jobb.jsx#L492), [:520](src/pages/Jobb.jsx#L520), [Journal.jsx:245](src/pages/Journal.jsx#L245), [Traning.jsx:328-338](src/pages/Traning.jsx#L328)
- **Vad är fel:** `update`/`delete` filtrerar bara på `.eq('id', …)` och förlitar sig helt på RLS för ägarskap.
- **Varför det är ett problem:** Enbart härdning — **inget aktivt hål.** Migration `20260615120100_phase1_01_rls_personal_tables.sql` sätter ägar-policies med `WITH CHECK` på samtliga berörda tabeller, så en cross-user-skrivning blockeras av Postgres. Men det enda försvarslagret är RLS: en framtida policyändring eller en ny tabell som glöms bort i listan blir omedelbart exploaterbar. `ensureOwnExerciseFromEditor` ([:328](src/pages/Traning.jsx#L328)) är den mest exponerade — den uppdaterar `training_exercises` enbart på `exercise_id`, alltså potentiellt globala rader.
- **Föreslagen fix:** Lägg till `.eq('user_id', user.id)` på alla mutationer där kolumnen finns (defense-in-depth ovanpå RLS).
- **Risk att fixa:** Låg.

### P3-11 · Småfel och dött state

- **`runForm.steps`** — [Traning.jsx:135](src/pages/Traning.jsx#L135), [:864](src/pages/Traning.jsx#L864): finns i state och nollställs, men renderas aldrig och sparas aldrig. `otherForm.steps` gör båda ([:1938](src/pages/Traning.jsx#L1938), [:883](src/pages/Traning.jsx#L883)). Inkonsekvent — löppass kan inte logga steg, "annat"-pass kan. *Fix: rendera fältet och spara det som i `saveOtherSession`, eller ta bort det ur state.*
- **Nikotintyp kollapsar till snus** — [Halsa.jsx:13-17](src/pages/Halsa.jsx#L13) definierar tre typer, men `nicotine` lagras som boolean och läses tillbaka som `data.nicotine ? ['snus'] : []` ([:110](src/pages/Halsa.jsx#L110), [:196](src/pages/Halsa.jsx#L196)). Väljer man vape eller cigaretter blir det snus vid nästa laddning. *Fix: lagra typen som text eller ta bort valen.*
- **`saveRunSession` uppdaterar aldrig löp-PR** — [Traning.jsx:838-860](src/pages/Traning.jsx#L838) anropar `fetchRunPRs()` men skriver inget till `run_personal_records`. Bara Strava-synkade pass ger löp-PR; manuellt loggade lopp räknas aldrig. *Fix: skriv en `run_personal_records`-rad när distansen matchar en `RUN_PR_DISTANCES`-post.*
- **`Halsa`s `count`** — [Halsa.jsx:288](src/pages/Halsa.jsx#L288): inkrementeras men läses aldrig (`importResult` använder `Object.keys(...).length`). *Fix: ta bort variabeln.*
- **`deleteSession`s `tid`** — [Traning.jsx:600](src/pages/Traning.jsx#L600): `const tid = toast(…)` används aldrig. *Fix: ta bort tilldelningen.*
- **Dubblerad `normalize`-logik** — [Traning.jsx:214-220](src/pages/Traning.jsx#L214): `.normalize('NFD').replace(/[̀-ͯ]/g,'')` gör redan om `å/ä` till `a`, så de efterföljande `.replace(/å/g,'a').replace(/ä/g,'a')` är döda (`ö` → `o` fungerar dock via `.replace(/ö/g,'o')` eftersom NFD+strip ger `o`). *Fix: ta bort de tre överflödiga `replace`.*
- **Hårdkodad modellsträng på två ställen** — [jarvis-chat/index.ts:967](supabase/functions/jarvis-chat/index.ts#L967) och [:1074](supabase/functions/jarvis-chat/index.ts#L1074): `Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6'`. Modell-id:t är giltigt, men fallbacken (och `ANTHROPIC_API_KEY`-läsningen) är duplicerad mellan stream- och non-stream-grenen och kan driva isär. *Fix: lyft ut till en konstant överst i filen.*

---

## Verifierat rent

Kontroller som gjordes och **inte** gav några fynd — värt att veta så de inte utreds igen:

- **JSX-syntax:** samtliga 77 JS/JSX-filer parsades med esbuild — 0 fel. Inga obalanserade divar, inga trasiga taggar. (Rå `<div>`/`</div>`-räkning ger falska utslag på grund av självstängande `<div … />`.)
- **JSX-kommentarer:** `{/*` och `*/}` balanserar i varje fil.
- **Regexar i JSX:** inga regex-literaler i JSX-attribut; inga `\s`- eller `%`-mönster i en position där de kan brytas av JSX-parsern. Samtliga 30 regexar ligger i vanlig JS-kod.
- **CSS-variabler:** trots sex `:root`-block är bara **en** custom property definierad två gånger (`--mx-page-gap`, rad 1321 och 2367). Variabellagret är alltså i ordning — problemet ligger enbart i selektor-blocken (P3-1).
- **`.upp-fill-*` / `.upp-map-leg-*`:** ser oanvända ut i en naiv sökning men konstrueras via template-literal ([Upplevelser.jsx:194](src/pages/Upplevelser.jsx#L194), [:214](src/pages/Upplevelser.jsx#L214)). Ta **inte** bort dem. Samma gäller `.fade-up-delay-*`.
- **Jarvis `log_health`:** gör korrekt select-then-update/insert med normalisering av `energy`/`energy_level` ([jarvis-chat/index.ts:679-687](supabase/functions/jarvis-chat/index.ts#L679)) — mönstret P0-8 efterlyser finns alltså redan här.
- **RLS-täckning:** migration `phase1_01` täcker samtliga 40 personliga tabeller med ägar-policies inklusive `WITH CHECK`. P3-10 är härdning, inte ett hål.
- **Auth:** `DEV_USER`-bypassen är hårt grindad bakom `import.meta.env.DEV` och strippas ur produktionsbundlen.

---

## Föreslagen ordning

1. **P0-1, P0-4, P0-6, P0-8** — en dags arbete, alla låg risk, tar bort tyst dataförlust och två fall av "fel data visas".
2. **P0-2, P0-3, P0-5, P0-7** — kräver ett beslut (datamodell/migrering) innan kod skrivs.
3. **P1-1 → P1-3** — Strava- och Apple Health-vägarna; störst risk för faktisk dataförlust vid import.
4. **P1-4 → P1-9** — kostnad och prestanda.
5. **P2** — de kända buggarna B1–B9 plus konsolideringen av duplicerade konstanter (P2-9 är den billigaste vinsten i hela listan).
6. **P3-1** sist och isolerat — CSS-konsolideringen är den enda posten med hög risk och måste verifieras sida för sida i dev-servern.
