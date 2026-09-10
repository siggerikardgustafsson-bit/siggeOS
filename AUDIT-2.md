# SiggeOS — Audit #2 + åtgärdssession

**Datum:** 2026-09-11
**Omfattning:** `src/pages/` (18 filer), `src/components/` (urval), `supabase/functions/jarvis-chat`, `src/index.css` (width-lagret). Fokus: lösa trådar sedan AUDIT.md (2026-09-09), plus nytt som tillkommit i de ~85 commits som gjorts sedan dess.
**Metod:** manuell genomläsning + grep-analys (schema-kolumn vs faktisk läsning, död state/props, `.eq('id')` utan `user_id`, no-op-handlers, UI utan backend).

**Status på gamla AUDIT.md:** P0–P3 är fixade och deployade (`b6677ce` P0, `fefd0ec` P1, `be1b21b` P2, `a330617`+`dde19f7` P3). De fyra dödfil-posterna (P3-4), spin-`<style>`-taggarna (P3-3), `TIER_COLORS`×7 (P2-9), Dashboard-imports (P3-5) — alla verifierat borta. Kvar från förr: **P3-1 (CSS-konsolidering)** — orörd, hög risk, se nedan.

---

## FAS 1 — Fynd

### Åtgärdat autonomt (entydigt)

| # | Fil · rad | Vad | Allvarlighet | Åtgärd |
|---|---|---|---|---|
| 1 | `Insights.jsx:492` | `last7Days`-funktionen deklarerad men aldrig anropad. `Insights.jsx:143` `select(…,nicotine,alcohol_units)` — de två kolumnerna läses aldrig i sidan. `differenceInDays`-importen blev oanvänd. | Låg (död kod) | Borttaget · `d3cbe08` |
| 2 | `Jobb.jsx:344,346-347` | `notes`, `savingNotes`, `expandedContact` + deras setters — deklarerade, aldrig använda. Rester efter en borttagen Erik-anteckningsfunktion. | Låg (död kod) | Borttaget · `0693732` |
| 3 | 9 sidor (`Export, Halsa, Jobb, Insights×2, Journal, Mal, Kalender, Plugg`) + `Upplevelser` | Varje sida hade `<div style={{ maxWidth: Npx, margin: '0 auto' }}>` runt innehållet — men `index.css` (~L2523/L2540, tillagd juni: *"Remove main content left gutter"*) tvingar `max-width: none !important` på allt sidoinnehåll. Kapen har alltså inte gjort något på månader. `Ekonomi.jsx` gör redan rätt (`mx-content-edge`, ingen död kap). | Låg (död kod, vilseledande) | Borttaget, sidor nu genuint fullbredd. Ingen visuell förändring. · `316938d` |
| 4 | ~30 mutationer i `Ekonomi, Jobb, Plugg, Traning, StudyModal` | `update`/`delete` filtrerade bara på `.eq('id', …)` och lutade sig helt på RLS för ägarskap (AUDIT.md P3-10, tidigare bara delvis fixad). RLS (`phase1_01`, `WITH CHECK`) blockerar cross-user, så inget aktivt hål — men enda försvarslagret. | Låg (härdning) | `.eq('user_id', user.id)` tillagt överallt. Ingen beteendeförändring. · `5b3d3b2` |
| 5 | `Settings.jsx:754` | Notiser-fliken: `notif_journal` / `notif_training` sparas men **ingen kod skickar någonsin en påminnelse** — ingen service worker, inget schemalagt jobb. Fliktexten hintade om det men växlarna såg funktionella ut. | Medel (UI utan backend) | Växlarna gråas ut + ärlig "kommer snart"-text. Preferensen sparas fortfarande. (Ditt val: "behåll som kommer snart".) · `dbf3c7d` |
| 6 | `Halsa.jsx:531` → ingenstans | "Marijuana"-knappen skrev `health_logs.marijuana` men värdet lästes **aldrig** — inte i redigera-modalen, inte i historik, inte i Jarvis. Orphan-write. | Medel (tyst dataförlust — data sparas men försvinner) | Kopplat in: redigerbar i redigera-modalen, chip i historik + Substanser-filtret, `jarvis-chat` `fetch_health`/`log_health` inkluderar den. (Ditt val: "koppla in ordentligt".) · `69e5537` — **kräver `supabase functions deploy jarvis-chat`** |

### Väntar på beslut (frågor ställda under passet)

Alla fyra besvarade via mobilen och åtgärdade ovan (#5, #6) eller nedan:

| Fråga | Ditt svar | Följd |
|---|---|---|
| Marijuana-logg: ta bort eller koppla in? | Koppla in ordentligt | Gjort · `69e5537` |
| Kost-widgeten (`nutrition_logs`) visas aldrig i UI, bara Jarvis ser den | "För nu räcker det att Jarvis får den — kanske en snygg vy i framtiden" | Ingen ändring. **Öppet:** en kalori/protein/vatten-graf på Hälsa-sidan (framtida). |
| Notiser-fliken (växlar utan effekt) | Behåll som "kommer snart" | Gjort · `dbf3c7d` |
| Formulär stretchas fullbredd på stora skärmar | Allt fullbredd | Gjort — inga formulärbreddskap kvar · `316938d` |

### Ej löst / medvetet hoppat över

| # | Vad | Varför |
|---|---|---|
| A | **AUDIT.md P3-1** — CSS: 294 döda deklarationer, `.page-header` definieras om i 12 block. | Hög risk. Kräver visuell verifiering sida för sida på 1440px, en selektor i taget. Inte en punktinsats — bör vara en egen session. Orörd. |
| B | **P2-8** — `SectionHeader` finns i 4 versioner (delad `ui/` + lokala kopior i `Profile`, `Settings`, `Insights`). | Den delade komponenten har nu `icon`-prop, MEN dess markup (`.mx-section*`-klasser) skiljer sig visuellt från de lokala (inline-stilar, border-bottom). Ett byte ÄR en designförändring, inte en identisk swap → kräver per-sida-verifiering. Inte "entydigt". |
| C | `nutrition_logs` utan egen vy | Ditt beslut: Jarvis-only för nu. |
| D | `deleteTrip` saknade bekräftelse (Upplevelser) | Redan fixat tidigare i sessionen · `faf9bea` (`window.confirm` + felkontroll). |

### Verifierat rent (kontrollerat, inget fynd)

- **Backlog B1–B9:** alla bekräftat fixade. `energy`/`energy_level`-fallback finns nu i Insights (P2-1). `runForm.steps` renderas + sparas, `saveRunSession` skriver `run_personal_records` (P3-11). QuickLog journal `.insert()` med felkontroll (P0-6/7). Journal AI-analys körs i både insert- och update-grenen (P2-6).
- **F1 (goals):** byggt + deployat. **F3 (Apple Health):** endpoint + setup-skärm byggt + deployat.
- **Konkurrerande datamodeller:** Maxx Score / tiers räknas live ur källtabellerna, inte ur `daily_scores` (`536f0fd`) → domänsidor kan inte driva isär. `tier_snapshots` skrivs korrekt inkl. `somn` (P0-4 fixad).
- **`deleteEntry`-timeout-mönstret** (P2-12): Träning flushar pending deletes i en unmount-cleanup; Journal använder en ref-Map + rensar vid "Ångra". Hanterat.
- **No-op-handlers:** grep över alla `onClick` — inga tomma, inga `console.log`-only, inga `alert()`. Inga "kommer snart"-knappar utom Notiser (åtgärdad).
- **Edge function payload/response:** `strava-sync`, `google-calendar-sync`, `health-ingest`, `price-fetch`, `jarvis-chat` — anropas alla, payload matchar frontend.

---

## Kvar för dig (deploy)

```
supabase functions deploy jarvis-chat
```

`69e5537` la till `marijuana` i `fetch_health` + `log_health`. Frontend degraderar tyst tills den är ute (Jarvis ser bara inte marijuana-fältet än).

Inga nya migrationer. Inget annat att deploya — resten är rena frontend-commits som Vercel bygger automatiskt.
