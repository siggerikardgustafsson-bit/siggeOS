# Phase 12 Report — Explainability & Insight Surface

> **Scope:** EXPOSE the intelligence already built in Phases 6–11 — make it *visible* and *clickable* in the existing UI. Build **no** new scoring system, **no** new benchmark system, **no** new AI system. Every surface consumes existing engines.
> **⚠️ Zero new math.** Every number rendered is read from an engine output and traceable: tier/percentile/factors → tierEngine via `buildWhyThisScore`; profile confidence → `profileCompleteness` (Phase 8); dataset confidence/source/coverage → benchmark registry (Phase 9); bottleneck impact/effort → Bottleneck Engine v2 + Rank Up (Phase 10); rank-up plans/opportunities → Rank Up Engine (Phase 10); evidence levels → `reason.evidenceLevel` (Phase 11). Verified byte-for-byte against those engines.

---

## 1. Files changed

**Added:**
- **`src/lib/insight.js`** — pure, UI-facing adapter. `buildCategoryInsight(ctx, id)`, `buildScoreInsight(ctx)`, `jarvisPrompts(name)`, plus confidence-band helpers (`evidenceUI`, `profileConfidenceBand`, `datasetConfidenceBand`). Consumes the Jarvis context + `reason.js` + Rank Up plans + the benchmark registry. **No recompute.**
- **`src/components/dashboard/InsightSections.jsx`** — renders the surfaces inside the existing `DetailModal`, in its existing visual language (section labels, surface cards, progress bars, evidence chips). Two modes: per-category and the Maxx-Score node.
- **`scripts/insight_surface_check.mjs`** — verification (**243/243**), Student / Fitness / Career.

**Modified (integration only — no redesign):**
- `src/components/dashboard/DetailModal.jsx` — imports `InsightSections`; accepts two optional props (`insightCtx`, `onAskJarvis`); renders one `<InsightSections>` block between the existing "Kategori-bidrag" and "Alla tiers" sections. Degrades to the pre-Phase-12 modal when no context is passed.
- `src/pages/Dashboard.jsx` — builds the Jarvis projection once via `useMemo(getJarvisUserContext(...))` and an `askJarvis` deep-link callback; passes both to `DetailModal`.
- `src/pages/Jarvis.jsx` — reads a deep-link `location.state.prompt`, sends it once, then clears the history state.

**No migration, no edge-function change, no score/tier/benchmark change.**

---

## 2. New surfaces (all inside the existing DetailModal)

The Dashboard nodes were already clickable → open `DetailModal`. Phase 12 makes that modal the **explanation surface**. Clicking a category or the Maxx core now reveals:

| # | Task | Surface | Source engine |
|---|---|---|---|
| 1 | Why This Score / Tier | **"Varför denna tier?"** — tier, percentile, top-%, profile factors, fallback flag, evidence chip | `explainTier` + `whyThisScore.categories` |
| 2 | Bottleneck UI | **"Flaskhals"** card (only when the category *is* a bottleneck) — impact, next tier, effort | `explainBottleneck` + Bottleneck Engine v2 (enriched) |
| 3 | Rank Up View | **"Rank up-plan"** — current → target, gap, score impact, estimated time, concrete steps | Rank Up `plans[]` |
| 4 | Opportunity View | **"Möjligheter"** (Maxx node) — Snabbast / Störst lyft / Närmast | `coachingRoutes` (fastest/biggest/easiest) |
| 5 | Confidence Surface | **"Hur säker är rankingen?"** — profile bar + dataset bar + sammanvägd evidence chip | Phase 8 + Phase 9 + `evidenceLevel` |
| 6 | Benchmark Transparency | collapsible **"Benchmark-källa"** — source, published date, confidence, provenance, coverage, notes | benchmark `DATASET_REGISTRY` |
| 8 | Jarvis Deep Links | **"Fråga Jarvis"** chips — open Jarvis with a pre-baked question | `jarvisPrompts` → `location.state` |

---

## 3. Explainability architecture

```
  Authoritative scoring system (Dashboard)
    computeMaxxScoreV2 · detectBottlenecksV2 · buildRankUpLayer · buildWhyThisScore · personalization
                         │  maxxProfile + categories + profile
                         ▼
  getJarvisUserContext(...)        ← Phase 11 projection (pure, no recompute)
                         │  ctx { score, byId{tier,percentile,profileConf,datasetConf,fallback,reason,factors},
                         │        bottlenecks, rankUp{opportunities,plans,gaps}, completeness, persona }
                         ▼
  insight.js  buildCategoryInsight / buildScoreInsight   ← Phase 12 view-model adapter (pure)
                         │  reuses reason.js (explainTier/explainBottleneck/benchmarkStatement/coachingRoutes)
                         │  + benchmark registry (getDatasetMeta) — STILL no new math
                         ▼
  InsightSections.jsx   → rendered inside DetailModal, existing style
```

The **same** `getJarvisUserContext` projection feeds both Jarvis (Phase 11) and the visual surface (Phase 12). One source of truth → the screen and the chatbot can never disagree.

---

## 4. Confidence architecture (task 5)

Three layers, surfaced honestly side-by-side rather than fused into one opaque number:

| Layer | Source | Shown as |
|---|---|---|
| **Profilkonfidens** (are *your* inputs complete?) | Phase 8 `calculateTierConfidence` (0–100) | bar + Hög/Medel/Låg band |
| **Datakonfidens** (is the *distribution* trustworthy?) | Phase 9 `datasetConfidence` (0–1, null = intern skala) | bar + Hög/Medel/Låg band |
| **Sammanvägd evidens** | Phase 11 `evidenceLevel(profile, dataset, fallback)` | chip: Fakta / Stark / Preliminär / Antagande |

The chip vocabulary is the **same** evidence model Jarvis uses, so a "Preliminär" economy reading on the Dashboard reads as `[SVAG]` to Jarvis — one confidence language across the product. The Maxx-node confidence card surfaces overall completeness + which categories run on fallback thresholds + which critical profile fields are missing.

---

## 5. Jarvis deep links (task 8) — context only

The "Fråga Jarvis" chips navigate to `/jarvis` with `state.prompt = <a question>`. **Only the question travels** — never a number. Jarvis already holds the grounded `MAXX INTELLIGENS` context block (Phase 11), so it answers the question from the objective systems. Jarvis sends the prompt once on arrival, then clears history-state so back/refresh doesn't re-fire it. No edge-function change.

Verified: every generated prompt is question-only (regex asserts no digits leak into the prompt).

---

## 6. Verification (task 9)

`scripts/insight_surface_check.mjs` (esbuild bundle + node) — **243/243** across Student / Fitness / Career. Per persona, it pushes the categories through the **authoritative Dashboard pipeline**, builds the context, and asserts the insight surfaces match the engines:
- tier is **consumed** (`ins.tier === category.tier`, never recomputed); percentile = `tierToPercentile`; top-% = 100 − percentile.
- "Varför denna tier?" text == `explainTier` verbatim; benchmark statement == `benchmarkStatement` verbatim.
- profile confidence == the projected Phase-8 value; dataset confidence == `datasetConfidence` registry value; `benchMeta.source` == the registry record.
- bottleneck card appears **iff** the category is in `bottlenecks`, and its impact == Bottleneck Engine v2 impact; a non-bottleneck category exposes none.
- rank-up plan target / score-impact / headline-gap == the Rank Up engine's plan.
- Maxx node: score consumed verbatim; fastest/biggest/easiest == `coachingRoutes`; "biggest" really is max score-impact; completeness == personalization; "what to improve" == `whatShouldIImprove`.
- deep-link prompts carry no numbers; confidence-band helpers + null-safety (null/`{}` → null, no throw).

**Regression:** Tier 14/14, Maxx 15/15, Profile 24/24, Benchmark 21/21, Rank Up 36/36, Jarvis 48/48 — all unchanged. All five changed/added source files pass per-file esbuild transform. **Browser-unverified** (auth-gated + RAM-wedged dev server, documented env limit); the layer is purely additive and renders nothing when no context is supplied, so it cannot alter any existing displayed value.

---

## 7. Remaining blind spots

- **Browser-unverified this session** — logic is proven in node; visual layout (the modal already scrolls, sections reuse its primitives) is unverified on-device.
- **Benchmarks still default-OFF** (Phase 9) — percentiles are the tier→band mapping, so "topp X%" is the tier band, not a measured distribution. The Benchmark-källa card is honest about this (provenance: "Härlett från appens trösklar", confidence shown). Real datasets would upgrade the dataset bars from Medel/Låg to Hög with earned confidence.
- **Effort/time is heuristic** (Phase 10 `EFFORT_RATES`) — the rank-up "Tid" estimate is a transparent heuristic, not a learned projection.
- **`plugg` has no external benchmark** (internal mastery scale) — it correctly shows "Intern skala" with no Benchmark-källa card.
- **Off-Dashboard surface** — the visual surface lives in the Dashboard's `DetailModal`; visiting Jarvis directly still uses the snapshot-based context (Phase 11), which is tier-level only.

---

## 8. Recommended next phase

**Phase 13 — Insight Quality & Coverage (or "Benchmark Activation").** Two clean directions:
1. **Activate measured benchmarks** — import real per-segment distributions behind the existing `benchmarksEnabled()` flag, so the Phase-12 confidence bars and "topp X%" become earned rather than tier-derived. The surface already displays whatever the registry reports, so this is a data swap, not a UI change.
2. **Edge-function tool surface** — add an `explain_bottleneck` / `rank_up_plan` tool to `jarvis-chat` so Jarvis can pull a specific plan on demand (the deep links currently pass the question; a tool would let Jarvis fetch the live plan object). Needs a `jarvis-chat` redeploy.

---

## 9. Constraints honored

No new scoring system, no new benchmark system, no new AI system, no custom modules, no social, no marketplace, no dashboard redesign. The surface is **integrated into the existing DetailModal** (same components/style), renders nothing without context, and every value is consumed from a Phase 6–11 engine. The objective scoring system remains authoritative; Phase 12 only makes it legible.
