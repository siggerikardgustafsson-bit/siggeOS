# Phase 9 Report — Benchmark Dataset Engine

> **Scope:** replace the *architecture* under the tier heuristics with a scalable benchmark/percentile layer that can consume real-world datasets — **foundation only**. **Constraints honored:** no UI redesign, no custom modules, no social, no Jarvis changes, no onboarding redesign.
> **⚠️ Compatibility:** the benchmark path is **opt-in and OFF by default**, so production tiers/scores are **byte-identical** until the flag is flipped after real datasets are validated. New `profiles`-independent migration adds storage tables (unapplied, like all prior phases).

---

## 1. Benchmark assumption inventory (task 1)

Every place a tier currently rests on a heuristic, and where it now routes when benchmarks are enabled:

| # | Assumption | Location (pre-Phase-9) | Type | Dataset that now backs it | Seed confidence |
|---|---|---|---|---|---|
| 1 | Bench/Squat/Deadlift/OHP bodyweight-multiple ladders | `tierUtils.js` `*_THRESHOLDS` | thresholds | `strength-standards` | 0.90 |
| 2 | Pull-up reps / weighted-dip added-kg ladder | `tierUtils.PULLUP_THRESHOLDS` | thresholds | `strength-standards` | 0.90 |
| 3 | Female strength factor (0.65 upper / 0.72 lower) | `tierEngine.strengthSexFactor` | multiplier | strength `segment()` scaler | derived |
| 4 | Strength age decline (~0.6%/yr after 30) | `tierEngine.strengthAgeFactor` | multiplier | strength `segment()` scaler | derived |
| 5 | VO2max ladder + sex (0.85) + age scalers | `tierUtils.VO2MAX_THRESHOLDS`, `vo2*Factor` | thresholds+mult | `vo2max-norms` | 0.88 |
| 6 | Running 1k/5k/10k/half/marathon ladders + sex(×1.10)/age | `tierUtils.RUN_*`, `run*Factor` | thresholds+mult | `running-standards` | 0.90 |
| 7 | Income ladder + life-stage/currency scalers | `tierUtils.INCOME_THRESHOLDS`, `ECON_LIFE_STAGE` | thresholds+mult | `income-distribution` | 0.60 |
| 8 | Savings ladder + life-stage/age scalers | `tierUtils.SAVINGS_THRESHOLDS`, `ECON_*` | thresholds+mult | `savings-distribution` | 0.55 |
| 9 | Net-worth ladder (`NET_WORTH_THRESHOLDS_SEK`) | `tierEngine` | thresholds | `savings-distribution` | 0.55 |
| 10 | Currency→SEK conversion table | `tierEngine.CURRENCY_TO_SEK` | multiplier | *(unchanged — FX, not a benchmark)* | — |
| 11 | BMI optimal band (~21.7) + symmetric falloff | `tierEngine.bmiTier` | bands | `bmi-bands` | 0.70 |
| 12 | Sleep duration ladder + age scaler | `tierUtils.SLEEP_*`, `sleepAgeFactor` | thresholds+mult | `sleep-norms` | 0.75 |
| 13 | Steps ladder + age scaler | `tierUtils.STEPS_THRESHOLDS`, `stepsAgeFactor` | thresholds+mult | `sleep-norms` | 0.75 |
| 14 | Tier→percentile labels (T1 bottom50…T8 top1%) | `tierUtils.TIER_NAMES` | percentiles | `schema.TIER_PCT` (canonical) | — |
| 15 | Study mastery 1–5 internal scale | `tierUtils.getStudyTier` | internal | *(no external norm — intentionally not benchmarked)* | — |
| 16 | Energy/mood/alcohol/supplement | wellbeing | internal | *(self-report, not benchmarked)* | — |

**Not benchmarked (by design):** study mastery, wellbeing self-reports (no external population norm), and FX conversion (a rate, not a distribution).

---

## 2. Architecture

```
                value + context
                      │
   tierEngine.calculate*Tier()  ── benchmarksEnabled()? ──no──► heuristic path (unchanged)
                      │ yes
                      ▼
   benchmarks/index.js  benchmarkTier(category, metric, value, ctx)
                      │
                      ▼
   benchmarks/percentile.js  percentileForValue()      ◄─ Percentile Engine (reusable)
                      │  ├─ datasets.js   getDataset()  → anchor table [{p,v}] + segment()
                      │  ├─ registry.js   getDatasetMeta() → source/date/confidence/coverage
                      │  └─ schema.js     percentileFromAnchors() / tierFromPercentile()
                      ▼
            { percentile, datasetConfidence } → tier (1–8)
```

**Flow shift (task 6):** `value → heuristic → tier` becomes `value → benchmark dataset → percentile → tier`, behind an adapter that returns `null` whenever there's no dataset or no value — so the caller transparently keeps its heuristic. The seam in `tierEngine.js` is six one-line guards (`const bench = tryBench(...); if (bench) return bench`); the engine itself was **not rewritten**.

**Compatibility seam:** seed anchor tables are built from the app's *existing* thresholds at their implied percentiles (`anchorsFromThresholds`), so a neutral lookup reproduces today's tiers. Verification confirms benchmark vs heuristic agree at the neutral anchor (`T5 == T5`). The `enableBenchmarks()` flag defaults **OFF**.

---

## 3. Files changed

**Added — benchmark layer (`src/lib/benchmarks/`):**
- `schema.js` — storage shape, `TIER_PCT`, `percentileFromAnchors`, `tierFromPercentile`, age/weight-class buckets, `anchorsFromThresholds`/`scaleAnchors`.
- `datasets.js` — seed anchor tables (per metric) + segment scalers; `getDataset()`.
- `registry.js` — `DATASET_REGISTRY` (source/date/confidence/coverage/provenance/status) + `getDatasetMeta`/`datasetConfidence`/`registrySummary`.
- `percentile.js` — **Percentile Engine** `percentileForValue()` (task 7).
- `index.js` — **Benchmark Engine** `get{Strength,Conditioning,Economy,Health}Benchmark`, generic `getBenchmark`, the **adapter** `benchmarkTier`, and `enableBenchmarks`/`benchmarksEnabled`.

**Added — other:**
- `supabase/migrations/20260620090000_phase9_00_benchmark_schema.sql` — `benchmark_datasets` + `benchmark_percentiles` reference tables (public-read RLS, service-role write).
- `scripts/benchmark_check.mjs` — verification (21/21).

**Modified:**
- `src/lib/tierEngine.js` — import the adapter + six opt-in benchmark guards (strength, conditioning, economy, health sleep/steps/bmi). No heuristic removed.

No UI, no component, no Dashboard change (constraint).

---

## 4. Confidence model (task 5) — two distinct layers

| Layer | Lives in | Question it answers | Example |
|---|---|---|---|
| **Profile confidence** (Phase 8) | `profileCompleteness.js` | How complete are the *user's* inputs? | "Strength 100% — sex/age/weight all set" |
| **Dataset confidence** (Phase 9) | `registry.js` `datasetConfidence` | How trustworthy is the *benchmark distribution*? | "Strength 90%, Economy 55%" |

These are **orthogonal** and both surface on `benchmarkTier` results (`datasetConfidence`) and the registry. A future "final tier confidence" is naturally `profileConfidence × datasetConfidence` (high only when the user's data is complete **and** the underlying dataset is solid) — wiring that product is left as the explicit next step so Phase 9 changes no displayed number.

Seed dataset confidences: strength 0.90 · vo2max 0.88 · running 0.90 · income 0.60 · savings/net-worth 0.55 · BMI 0.70 · sleep/steps 0.75. Economy is deliberately lowest (single-country, skewed, life-stage-scaled).

---

## 5. Storage schema (task 3)

`benchmark_datasets` (one row per source × metric × segment): `category, metric, sex, age_min, age_max, weight_class, country, life_stage, higher_is_better, unit, source, source_url, published_date, dataset_confidence, provenance, status, coverage(jsonb)`. `benchmark_percentiles` (many per dataset): `(dataset_id, percentile, value)`. Public-read RLS (reference data, mirrors the `exercise_library` pattern); writes are service-role only. Indexed on `(category, metric, status)` and `(dataset_id, percentile)`. The app reads the **in-app seed** today; an importer writes these tables and a loader will later prefer `status='imported'` rows.

---

## 6. Future dataset import strategy

1. **Acquire** published percentile tables per metric/segment (sources in §7).
2. **Transform** to `(category, metric, sex, age range, weight_class, country, life_stage, [{percentile, value}])` rows.
3. **Load** into `benchmark_datasets` + `benchmark_percentiles` with `provenance='imported'`, `status='imported'`, and a measured `dataset_confidence`.
4. **Loader** (future, ~30 lines): on app start, fetch imported rows → build the same `{p,v}` anchor tables `datasets.js` exposes, replacing seed tables where present (prefer `imported` over `seed`). The Percentile/Benchmark engines need **no change** — they already consume anchor tables; only the table *source* swaps from JS seed to DB.
5. **Validate** with a shadow compare (benchmark tier vs heuristic tier distribution across real user data) before flipping `enableBenchmarks(true)`.
6. **Replace segment scalers with measured cells** — the biggest accuracy win: store real female / per-age-range / per-country anchor tables instead of scaling one base table.

---

## 7. Recommended data sources

- **Strength:** StrengthLevel / Symmetric Strength / ExRx norms; raw-lift datasets by sex + bodyweight class (OpenPowerlifting for the elite tail).
- **Conditioning:** ACSM / Cooper Institute VO2max norms by sex+age; RunningLevel / age-grade tables (WMA) for running.
- **Economy:** SCB (Sweden) income/wealth deciles, then OECD / World Bank for multi-country; Credit Suisse Global Wealth Report for net-worth tails. Per-country is essential here.
- **Health:** WHO BMI bands; NSF / CDC sleep-duration recommendations by age; CDC step-count distributions.

---

## 8. Verification (task 8)

`scripts/benchmark_check.mjs` (esbuild + node) — **21/21 pass**: registry coverage + distinct dataset confidence; benchmark lookup returns anchors+metadata; **percentile calculation** (bench 1.3×BW → p90 matching the Top-10% threshold, monotonic, lower-is-better running handled, female segment shifts the bar); **adapter** value→percentile→tier with `source='benchmark'` + datasetConfidence; **null fallback** when no value / no dataset; **compatibility** — flag OFF identical, ON routes through benchmark and agrees with the heuristic at the neutral anchor (T5==T5), OFF again restores the heuristic path; **graceful** handling of unknown metrics.

Regression: Phase 7 `maxx_score_check` **15/15**, Phase 8 `profile_completeness_check` **24/24** — both run with the flag at its default OFF, confirming no behaviour change. All new files + `tierEngine.js` pass per-file esbuild transform. (Browser-unverified — pure logic layer, default-off, not surfaced in any view this phase.)

---

## 9. Remaining blockers before real benchmarks go live

- **Segment scalers are still heuristics** — they're now *isolated* in `datasets.js` `segment()` instead of scattered through the engine, but real per-segment measured anchors are the actual accuracy unlock (§6.6).
- **Single-country economy** — income/savings/net-worth are SEK-anchored; needs per-country imports before `enableBenchmarks(true)` for non-SE users.
- **No DB loader yet** — tables exist (unapplied migration); the importer + loader are future work. App reads the seed.
- **Final confidence product not wired** — profile × dataset confidence is specified but intentionally not surfaced (no number changes this phase).
- **Validation gate** — flipping the flag on needs a shadow-compare against real user data first. Until then, OFF.

---

## 10. Constraints honored

No UI redesign, no custom modules, no social, no Jarvis changes, no onboarding redesign. Phase 9 added an isolated benchmark/percentile foundation + storage schema + an opt-in, default-off Tier Engine seam — fully additive and backwards-compatible.
