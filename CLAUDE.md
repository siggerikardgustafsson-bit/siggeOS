# SiggeOS / MaxxIt — instructions for Claude

A personal "life OS" run like a company: health, training, sleep, economy, studies (medicine at KI), travel, goals and side projects, with **Jarvis** as an AI coach. Single user and developer (Sigge), but the code stays multi-user-safe: RLS everywhere, never hardcode the user's name. The UI and Jarvis speak Swedish; code comments are in English.

Stack: React + Vite (Vercel, deploys on push to `main`) · Supabase (Postgres + RLS, edge functions in Deno, pg_cron + pg_net, Vault) · Anthropic API.

## Working rules (the user's)

- **One thing at a time.** Stability before speed. One logical change per commit.
- **Run `npm run build` after every change.** It also regenerates the server bundle (see below).
- **Never append CSS to the bottom of `src/index.css`.** Use existing classes plus inline styles, or put rules in the section they belong to.
- **Work from `~/dev/sigge-os`, not `~/Desktop/sigge-os`.** The Desktop copy lives in iCloud and builds and dev servers hang there.
- **Verify before claiming.** Build, then `scripts/*_check.mjs`, then a dry run against prod data, then the browser. The browser preview needs the user's own login.

## Deploying

- **Frontend:** push to `main` and Vercel deploys.
- **Migrations:** `supabase/migrations/2026MMDDHHMMSS_post_deploy_NN_<what>.sql`, applied with `supabase db push --linked --yes`. Check `supabase migration list --linked` first.
- **Edge functions:** `supabase functions deploy <name>`. These **must** be deployed with `--no-verify-jwt`, because they authenticate themselves: `strava-sync`, `tier-snapshot`, `jarvis-weekly`, `push-notify`, `google-calendar-sync`, `jarvis-memory`, `health-ingest`, `skill-ingest`, `ekonomi-bank-link`. `jarvis-chat` and `ekonomi-sync` keep verify_jwt.
- **Ad-hoc SQL:** `supabase db query --linked "<sql>"` (use `-o json`). Show a dry-run count before any data backfill.

## Shared code: browser + server bundle

`src/lib/serverEntry.js` is bundled by `scripts/bundle-tier-compute.mjs` (part of `npm run build`) into the committed `supabase/functions/_shared/serverLib.bundle.js`, with the browser supabase client stubbed out. The bundle contains:
- `tierCompute.js`: all tier/category math and ladders. Dashboard and the nightly snapshot both use it.
- `jarvis/nowContext.js`: the Jarvis "NU" context.
- `experiments.js` and `goalMetrics.js` (the resolvers take a `db` param).
- `pay.js`: the shift pay engine (Stockholm time).

**If you change anything that ends up in the bundle, commit the regenerated bundle and redeploy every function that imports it: `tier-snapshot`, `jarvis-weekly`, `push-notify` (all `--no-verify-jwt`), `jarvis-chat` and `google-calendar-sync` (`--no-verify-jwt`).** Modules in the bundle must never import `./supabase` for anything they actually call. Pass the client in as a parameter.

## Scheduled jobs (pg_cron, secrets in Vault)

| Job | When (UTC) | Function |
|---|---|---|
| `strava-sync-3h` | `17 */3 * * *` | strava-sync `?action=cron` (incremental) |
| `tier-snapshot-nightly` | `45 21 * * *` | tier-snapshot (UTC and Stockholm share the date then) |
| `jarvis-weekly` | `0 18 * * 0` | weekly report → `jarvis_reports` + chat |
| `push-notify-hourly` | `2 * * * *` | reminders, decided in Stockholm time |
| `jarvis-memory-nightly` | `30 1 * * *` | jarvis-memory: the day's chat and journal → add/update/archive insights (`?mode=curate` condenses everything, `?dry=1`) |
| `calendar-sync-2x` | `30 4,16 * * *` | google-calendar-sync `?action=cron`: PA shifts and obligatoriska moment for every connected user |

`tier-snapshot` supports `?dry=1` and returns per-category bottlenecks. To run a job by hand, use `net.http_post` with the Vault secret, then read `net._http_response`.

## Jarvis (supabase/functions/jarvis-chat)

**Models:**
- `claude-sonnet-5-5` (adaptive thinking, effort low) for chat and anything that needs judgment.
- `claude-haiku-4-5` for extraction features listed in `HAIKU_FEATURES`.
- **Every AI call from the frontend must send `feature: '<tag>'`.** Add new cheap tags to `HAIKU_FEATURES` deliberately.
- `between_tools` was tested and rejected (runaway output).

**Prompt caching:** tools and the static instructions (persona, self-image "VEM DU ÄR", PROFIL) are cached for 1 h. MINNE and NU are cached for 5 min. There is a breakpoint on the last message. **Never put timestamps or per-request data above a breakpoint.** The `TID:` line is extracted and sent as an uncached tail.

**Memory:** `jarvis_insights` rows with `archived_at` null are the active memory. All of them (max 120, grouped by category) go into MINNE. They are never hard-deleted, only archived, and the archive stays searchable via `fetch_memory_goals`. `jarvis-memory` maintains the memory nightly. Structured JSON from Sonnet 5.5 uses `output_config.format`, because forced `tool_choice` returns 400 on that model.

**Profile:** Jarvis gets `user_settings.about_me_summary`, not the full `about_me` (~40k chars, reachable via `fetch_memory_goals`). The summary is regenerated from Settings when `about_me` changes.

**Generic data access:** `fetch_records`, `create_record`, `update_record` and `delete_record` run over `RECORD_SCHEMA`, a whitelist of tables and columns. **Update `RECORD_SCHEMA` when you add user-owned tables or columns.**

**Attachments:** a PDF or image travels only with the chat message it is sent with (`Jarvis.jsx` `fileToAttachment`); history keeps a "📎 name" line. Jarvis must read and save everything in that same turn.

**Extraction mode** (`systemPrompt` set): messages pass through untouched. Never stringify or truncate them; a bug doing that broke PDF extraction for months.

**Cost:** every request is logged to `ai_usage`, and Settings → Jarvis AI shows it. If you change model pricing, update `supabase/functions/_shared/aiUsage.ts` PRICES.

## Data conventions and sources of truth

- **Dates:** calendar dates are Europe/Stockholm. Never use `toISOString().slice(0,10)` for "today" on the server.
- **`training_sessions.session_type`:** `run | gym | walk | other` (English).
- **Weight goal:** the active `goals` row with `metric = 'body_weight'` (Mål page) is **the** målvikt. Use `resolveTargetWeight()` and pass the resolved value into `detectSignals`. More generally, goal rows beat numbers in profile text.
- **Tiers:** `tierCompute.js` `ladder()` derives bottleneck, "Lås upp" and "Alla tiers och krav" from the same thresholds the engine uses. Never hand-write requirement tables.
- **Economy:**
  - Salary period = payday (25th) to the day before the next payday.
  - Lön, CSN or hyra booked within 7 days before payday counts toward the next period (`effectivePeriodDate`).
  - Bank credits are classified by `classifyIncome` in `ekonomi-sync`, **mirrored in `src/lib/csn.js`. Keep the two in sync.**
  - CSN fribelopp counts only salary. Net `Lön` is grossed up at 30%.
  - **Pay is never hardcoded.** Each job is an `employments` row (Jobb → Tjänster) with its own rules: hourly rate, OB rules, jour (flat rate plus per-day `jour_rules`), semesterersättning, tax rate and calendar keywords. `pa_shifts.employment_id` links a shift to its job. `src/lib/pay.js` `priceShift`/`shiftPay` prices shifts live everywhere. `estimated_pay` is only a cache for Export and is refreshed when a job is saved. A rule window that crosses midnight belongs to the day it starts.
- **Gym logging:** every path resolves exercise names against `exercise_library` (`src/lib/exercises.js`) and goes through `updatePersonalRecord`. Workout templates (`workout_templates`, Träning → Passmallar) start a live workout (`ActiveWorkout.jsx`) that mirrors its state to localStorage on every change and saves only checked sets through `src/lib/gymSession.js`.
- **Journal and Hälsa ratings** start as null. Never default a rating to a made-up value.
- **Do not re-add** the idea trips the user deleted (Kilimanjaro, Skottland). The Dashboard is a score cockpit, not a life-briefing page.

## Useful scripts

- `scripts/*_check.mjs`: pure-logic checks. Bundle with esbuild, then run with node (see the header of each file), for example `experiments_check.mjs`.
- **Prod-data checks from node:** get the service-role key into an env var without printing it (`supabase projects api-keys ... -o json`), then import `supabase/functions/_shared/serverLib.bundle.js`.
