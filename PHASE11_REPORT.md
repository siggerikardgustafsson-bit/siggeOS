# Phase 11 Report — Jarvis Intelligence Layer v2

> **Scope:** make Jarvis *consume and reason about* Maxx Score v2, the Bottleneck Engine, Rank Up Plans, the Benchmark Engine and the Profile Engine — **without changing the objective scoring system**. Jarvis analyzes; Jarvis does not calculate scores. **Constraints honored:** no AI memory systems, no custom modules, no social, no new model providers, no dashboard redesign.
> **⚠️ Architecture, not authority:** every number Jarvis cites is *consumed* from an engine output and tagged with an evidence level. The objective score stays owned by the scoring system (`computeMaxxScoreV2` via the Dashboard). Verified: the Jarvis context's score is the authoritative score, byte-for-byte — never a parallel recompute.

---

## 1. Files changed

**Added — `src/lib/jarvis/`:**
- `context.js` — **`getJarvisUserContext({ profile, categories, maxxProfile })`** (task 1): a pure projection that bundles profile, goals, life stage, category tiers, percentiles, bottlenecks, rank-up plans, completeness and confidence. Plus `describePersona` (task 5) and the `DASH_BENCHMARK` map.
- `reason.js` — the reasoning tools: `evidenceLevel` + `EVIDENCE` (task 6), `benchmarkStatement` (task 4), `explainTier` / `explainBottleneck` / `whatShouldIImprove` / `fastestRankUp` (task 8), `coachingRoutes` (task 3), `opportunityNarrative` (task 7), `personaStatement` (task 5), `buildJarvisContextBlock` (the LLM-facing block), `answerAll`.
- `index.js` — re-exports + `reconstructFromSnapshot` + the optional async **`loadJarvisContext({ supabase, userId, getProfile })`** (reads persisted tiers, routes through the authoritative engines).
- `scripts/jarvis_intelligence_check.mjs` — verification (**48/48**), Student / Fitness / Career.

**Modified:**
- `src/pages/Jarvis.jsx` — `refreshContext()` now appends the grounded **MAXX INTELLIGENS** block to the existing `context` string (best-effort; degrades to the lean context on any failure). No edge-function change required.

**No migration, no edge-function change, no score/tier change.**

---

## 2. Context architecture — Jarvis consumes, never computes

```
  Scoring system (Dashboard, authoritative):
    computeMaxxScoreV2 · detectBottlenecksV2 · buildRankUpLayer · buildWhyThisScore · personalization
                         │  (maxxProfile + categories + profile)
                         ▼
  jarvis/context.js  getJarvisUserContext(...)   ← pure projection, NO recompute
    { meta:{scoreOwner:'scoring-system'}, profile, persona, score(consumed),
      completeness, categories[{tier,percentile,profileConf,datasetConf,usingFallback}],
      bottlenecks(enriched), rankUp{opportunities,plans,howToImprove,topOpportunity} }
                         │
                         ▼
  jarvis/reason.js   explain*/coaching/narratives  → grounded, confidence-tagged text
                         │
                         ▼
  jarvis/index.js    buildJarvisContextBlock(ctx)  → self-labeling "MAXX INTELLIGENS" block
                         │
                         ▼
  Jarvis.jsx refreshContext()  → appended to `context` → edge fn injects as "NU:" → LLM
```

**Two ways in, same projection:**
1. **From the Dashboard** — pass its live `maxxProfile` + `categories` + `profile` (richest: concrete rank-up gaps like "+12 kg").
2. **Off-Dashboard (`loadJarvisContext`)** — reads the latest **persisted `tier_snapshot`** the scoring system already wrote and runs the *same* engines (`computeMaxxScoreV2`, `detectBottlenecksV2`, `buildRankUpLayer`). It **reads** tiers, never recomputes them from raw metrics; gaps degrade to tier-level. Best-effort → `null` on failure so Jarvis keeps its current lean context.

The integration needs **no edge-function redeploy**: the block flows through the existing `context` param. The current Jarvis.jsx wiring uses path 2 (snapshot) so it works standalone.

---

## 3. Reasoning architecture

Every helper returns both prose (Swedish — Jarvis speaks Swedish) **and** the raw `data` it used, so the explanation is auditable against the engine:

| Tool | Question | Grounded in | Matches (verified) |
|---|---|---|---|
| `explainBottleneck` | "Why is this a bottleneck?" | Bottleneck Engine v2 | names `bottlenecks[0].id`, quotes `.impact` verbatim |
| `coachingRoutes` | fastest / biggest / easiest | Rank Up opportunities | min-months / max-impact / max-progress |
| `benchmarkStatement` | percentile + confidence | tier→percentile + registry | `topPercent == 100 − pct`, `datasetConfidence` from registry |
| `whatShouldIImprove` | "What should I improve?" | `rankUp.topOpportunity` | same id as the prioritized top |
| `fastestRankUp` | "What is my fastest rank-up?" | `coachingRoutes.fastest` | same id |
| `explainTier` | "Why am I this tier?" | `whyThisScore` + tier | reports the actual tier/percentile |
| `opportunityNarrative` | task-7 narrative | one opportunity | cites gap + `T n→T n+1` + score impact |

**No invented reasoning:** the bottleneck wording mirrors the task spec ("…because improving it one tier would provide the largest increase in Maxx Score") and the named category + impact number come straight from `detectBottlenecksV2`.

---

## 4. Confidence system (task 6)

Four evidence levels, attached to every statement so Jarvis phrases each at the right strength:

| Level | Tag | When | Example |
|---|---|---|---|
| **FAKTA** | `[FAKTA]` | a measured value / a tier the user objectively holds | "Maxx Score: T2" · "VO2max är 58" |
| **STARK EVIDENS** | `[STARK]` | engine-derived, high profile **and** dataset confidence | "Topp 30% för styrka bland liknande profiler" |
| **SVAG EVIDENS** | `[SVAG]` | engine-derived but low confidence / fallback thresholds | economy benchmark (dataset 0.55) · any `usingFallback` tier |
| **SPEKULATION** | `[SPEKULATION]` | a behavioural inference NOT in the data | "Du kanske prioriterar styrka över löpning" |

`evidenceLevel({ measured, inferred, profileConfidence, datasetConfidence, usingFallback })` — thresholds: profile ≥75 strong / <55 weak; dataset ≥0.8 strong / <0.6 weak; `usingFallback` forces weak; `measured` → fact; `inferred` → speculation. This fuses **both** confidence layers built earlier: Phase-8 *profile* confidence (are the inputs complete?) and Phase-9 *dataset* confidence (is the distribution trustworthy?) — so economy is honestly weak (thin data) and a complete-profile strength claim is strong.

---

## 5. Example outputs (from the verification)

```
[STARK] Kondition är din främsta flaskhals eftersom en höjning med en tier skulle ge
        den största ökningen av din Maxx Score (≈ +3 poäng), uppskattad insats: snabb (~1 mån).

[STARK] Du ligger i topp 30% för styrka bland användare med liknande profil (T3, percentil 70).

        Din snabbaste väg till högre Maxx Score är att höja hälsa en tier (T3 → T4).
        Utifrån din nuvarande lucka (+1) tar det ungefär några veckor och ger ≈ +1.5 poäng.
```

The self-labeling block Jarvis receives (excerpt):
```
— MAXX INTELLIGENS (objektiva system äger poängen; analysera, beräkna ej) —
[FAKTA] Maxx Score: T2 (Top 50%), viktad percentil …, svagaste länk T2.
[FAKTA] Profil: student (student). Viktningen följer "student" — påverkar prioritering, inte poängberäkningen.
TIERS:
  [STARK] Styrka: T3 (Top 30%), topp 30%, profilkonf 100
  [SVAG]  Ekonomi: T2 (Top 50%), topp 75% …
[STARK] FLASKHALS: Kondition är din främsta flaskhals …
[STARK] SNABBASTE RANK-UP: Din snabbaste väg … är att höja hälsa en tier …
```

---

## 6. Verification (task 9)

`scripts/jarvis_intelligence_check.mjs` (esbuild + node) — **48/48 pass** across **Student / Fitness / Career** personas (each a real profile row + dashboard categories pushed through the authoritative Dashboard pipeline, then projected by `getJarvisUserContext`). Asserts, per persona, that:
- the bottleneck explanation names **`bottlenecksV2[0]`** and quotes its impact,
- "what should I improve?" equals **`rankUp.topOpportunity`**,
- the context score equals the **authoritative** score (consumed, not recomputed),
- the context block is self-labeling and quotes the consumed score.

Plus: coaching routes match min-months / max-impact / max-progress; benchmark `topPercent` and `datasetConfidence` match the registry; the four confidence levels resolve correctly; persona detection (student/fitness/career) does not alter the score; the snapshot loader reads tiers verbatim and degrades to `null` on bad input.

**Regression:** Tier 14/14, Maxx 15/15, Profile 24/24, Benchmark 21/21, Rank Up 36/36 — all unchanged. All four changed/added files pass per-file esbuild transform. **Browser-unverified** (auth-gated + RAM-wedged dev server, documented env limit); the layer is additive and best-effort, so it cannot change any displayed score.

---

## 7. Why no edge-function / model change

Constraints forbid new model providers and AI memory systems. The intelligence layer needs **neither**: it produces a grounded, self-labeling text block that rides the *existing* `context` channel into the *existing* system prompt (`NU:`). The `[FAKTA]/[STARK]/[SVAG]/[SPEKULATION]` tags are self-documenting, so the current model already knows how strongly to phrase each line. A one-line system-prompt nudge ("respektera evidensetiketterna") would reinforce it but requires a `jarvis-chat` redeploy — left out to keep this phase deploy-free, noted as an optional follow-up.

---

## 8. Remaining gaps before Jarvis v3

- **Snapshot path is tier-level, not metric-level.** `loadJarvisContext` reads persisted *tiers*, so rank-up gaps degrade to "T n → T n+1"; the concrete "+12 kg / 3 min over 5 k" gaps exist only when the Dashboard passes its live `maxxProfile`. v3: persist the rank-up layer (or have the Dashboard hand its `maxxProfile` to the Jarvis page) so off-Dashboard answers carry concrete gaps.
- **Benchmarks are still default-OFF** (Phase 9), so percentiles are the tier→band mapping, not measured distributions — the confidence tags already mark economy weak, but real datasets would let Jarvis say "top 8%" with earned confidence.
- **No tool-call surface.** Jarvis reads the context block but has no `explain_bottleneck`/`rank_up_plan` *tool* yet — adding one to the edge-function TOOLS array (so the LLM can pull a specific plan on demand) is a clean v3 step.
- **Speculation is enabled but unused by the layer** — `evidenceLevel({inferred:true})` exists; the layer never emits a speculation itself (it only grades). v3 could let Jarvis form labelled hypotheses ("du kanske prioriterar styrka över löpning") explicitly tagged `[SPEKULATION]`.
- **Persona set is heuristic** (life stage + focus → label) — fine for tone, but not learned; deliberately not a memory system (constraint).
- **Browser-unverified** this session.

---

## 9. Constraints honored

No AI memory systems, no custom modules, no social, no new model providers, no dashboard redesign. Jarvis never controls or recomputes the score — it consumes the objective engines, tags everything by confidence, and the scoring system remains authoritative. Fully additive; prior-phase tests unchanged.
