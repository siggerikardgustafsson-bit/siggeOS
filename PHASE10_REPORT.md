# Phase 10 Report — Rank Up Plans Engine

> **Scope:** turn scores, tiers, bottlenecks and benchmarks into *actionable* progression — rank gaps, score-impact estimation, ranked opportunities, reusable plans, three rank-up strategies, and a "How do I improve this?" payload. **Constraints honored:** no custom modules, no social, no marketplace, no Jarvis redesign. **The action layer.**
> **⚠️ Additive & non-destructive:** one new pure module (`src/lib/rankUp.js`) + a thin Dashboard *data layer*. No tier, no score formula, no UI redesign was touched. Prior-phase tests still pass byte-for-byte (Tier 14/14, Maxx 15/15, Profile 24/24, Benchmark 21/21).

---

## 1. Files changed

**Added:**
- `src/lib/rankUp.js` — the whole engine (pure, no DB/React):
  - `computeRankGap(category)` — **Rank Gap Engine** (task 1).
  - `estimateScoreImpact(rankCats, weights, catId, tierDelta)` — **Score Impact model** (task 5).
  - `buildOpportunities(rankCats, weights, {profile})` — **Opportunity Engine** (task 2).
  - `enrichBottlenecks(bottlenecksV2, rankCats, weights)` — **Bottleneck integration** (task 4).
  - `buildRankUpPlan(category, {rankCats, weights})` — **Plan generator** (task 3).
  - `RANK_UP_PROFILES` + `prioritizeOpportunities` — **Rank Up Profiles** (task 6).
  - `buildHowToImprove(score, rankCats, weights, {profile})` — sibling of `buildWhyThisScore` (task 8).
  - `buildRankUpLayer(rankCats, {...})` — single Dashboard aggregate (task 7).
  - `estimateEffort(...)` + `EFFORT_RATES` — transparent effort/time heuristics.
- `scripts/rank_up_check.mjs` — verification (**36/36**), three personas.

**Modified:**
- `src/pages/Dashboard.jsx` — import `buildRankUpLayer`; compute `bottlenecksV2` once; attach `rankUp` to `maxxProfile`. **Data layer only** — no visual redesign (task 7 honored: "small indicators only / do not redesign").

No new migration (consumes data the Dashboard already computes). No Jarvis/onboarding/UI-component change.

---

## 2. Architecture — it consumes, it never recomputes

```
  Dashboard category (already computed each load):
    { id, name, tier:{tier}, hasData, decayWarning,
      levelUp:{ requirements:[{label,current,target,gapLabel,progress,met,missing}], ... } }
                         │
                         ▼
  rankUp.computeRankGap ──► { currentTier, nextTier, headlineGap:"+12 kg", gaps[], bindingMetric }
                         │
  rankUp.estimateScoreImpact ──► recompute computeMaxxScoreV2 with catTier+1 ──► { weightedDelta, headlineDelta }
                         │                                   (EXISTING weighting — no AI)
                         ▼
  buildOpportunities → [{ gap, scoreImpact, effort, atRisk }]  ──prioritize(profile)──► ranked
                         │
  buildRankUpPlan → { current, target, required[], estimatedMonths }
  enrichBottlenecks(detectBottlenecksV2) → + effort + nextTier + plan
  buildHowToImprove → { headline:{fastestPath,biggestImpact}, topOpportunities, plans }
                         │
                         ▼
  buildRankUpLayer  ──►  maxxProfile.rankUp   (Dashboard data layer)
```

The engine reads the binding requirement (hardest unmet — a missing one first, else lowest-progress), exactly mirroring `Dashboard.makeLevelUp`'s primary-bottleneck logic, so the "gap" the user sees on a category card and the gap the plan acts on are the **same number**.

---

## 3. Rank Gap Engine (task 1)

For every rankable category: `currentTier`, `nextTier`, and the concrete gap, taken from the category's own unmet requirements. Verified outputs:

| Category | Current | Next | Gap |
|---|---|---|---|
| Styrka (bench-bound) | T3 | T4 | **+12 kg** |
| Ekonomi | T2 | T3 | **+25 000 kr** |
| Kondition (5 km) | T2 | T3 | **3:00 snabbare** (180 s) |

Lower-is-better metrics (running times) yield a positive numeric distance (`gapValue`); maxed (T8) categories return `atMax` and no gap.

---

## 4. Opportunity Engine + Score Impact model (tasks 2, 5)

**Score impact** is a pure recompute: bump one category's tier by 1, re-run the *existing* `computeMaxxScoreV2` with the *current* profile weights, diff the result. No AI, no new weighting.
- `weightedDelta` — the weighted-percentile (score) gain.
- `headlineDelta` — whether the whole headline tier moves (0 or 1).
- `percentileDelta` — the raw percentile the category itself gains.

Two invariants verified: raising a category **never lowers** the score, and lifting the **weakest link** moves it more than lifting an already-strong one (`econ +2.4` vs `somn +1.8` for the Student).

**Opportunities** = one `+1-tier` move per non-maxed category, each carrying `{gap, scoreImpact, headlineDelta, effort, atRisk, decayWarning}`, sorted by the active Rank Up Profile, each stamped with a 1-based `priority`. Student example (balanced):

```
#1 Kondition  +3 poäng   3:00 snabbare  (Snabb, ~0.6 mån)
#2 Plugg      +2.4 poäng  +8%           (Snabb, ~0.7 mån)
#3 Sömn       +1.8 poäng  +0.4h         (Måttlig, ~1.4 mån)
```

---

## 5. Effort / time model (task 4) — heuristic, dataset-ready

Effort is estimated transparently, same "heuristic now, swap a dataset later" seam as Phases 6/9:
- **Unit-rate path** (`EFFORT_RATES`): linear rate for a category's natural unit — strength `2.5 kg/mån`, economy `4000 kr/mån` (assumed surplus), sleep `0.4 h/mån`, study `12 %/mån` — scaled by tier difficulty (each tier above T3 is harder).
- **Progress-curve fallback** (kondition/halsa — no clean linear unit): `baseMonths × remaining-fraction × tierDifficulty`.
- **Missing data** → `months: null`, `basis: 'needs-data'` ("Logga data först").

Output: `{ months, bucket: quick|moderate|significant|major, label, basis, confidence }`. Each rate carries a `confidence` (economy lowest at 0.4 — surplus is assumed, not measured). **These rates are the single place to replace with measured progression data** — no call site changes.

`enrichBottlenecks` takes the **existing** `detectBottlenecksV2` output and adds `nextTier`, `effort` and the category's full `plan` — so a bottleneck now answers *impact*, *next tier* and *effort* (task 4) without re-detecting anything.

---

## 6. Rank Up Plan generator (task 3)

Reusable structure, e.g. the Student's Economy plan:

```
Ekonomi   T2 (Top 50%) → T3 (Top 30%)   est ~6 månader
  • Sparkapital: +25 000 kr
  • Månadsnetto: +4 000 kr
  scoreImpact +2.4 · effort "significant"
```

`{ id, name, currentTier, targetTier, required[], estimatedMonths, effort, scoreImpact, headlineDelta, atMax }`. `required[]` is built from the unmet requirements (missing metrics become "Logga …" steps). It's data-only and JSON-friendly, ready for any card/modal/Jarvis to render.

---

## 7. Rank Up Profiles (task 6) — architecture only

Three strategies, each a scoring function over opportunities — nothing applies one automatically:

| Profile | Prioritizes | `weigh` |
|---|---|---|
| **Aggressiv** | raw score growth, effort ignored | `impact + (headlineMove ? 40 : 0)` |
| **Balanserad** | growth ÷ feasibility | `(impact + headlineBonus) / √months` |
| **Underhåll** | protect rank — actively-decaying first | `decay 120 + atRisk 40 − tier·4 + cheapHold 15` |

Verified divergence on a built case (Ekonomi: huge impact but ~49 mån; Styrka: small impact, ~1 mån, **decaying**):
```
Aggressiv  → Ekonomi  (biggest impact, effort ignored)
Balanserad → Ekonomi  (it also lifts the whole headline tier — but Styrka gains ground)
Underhåll  → Styrka   (the actively-decaying category)
```
Note the honest behavior: Balanced agrees with Aggressive *when the top move also bumps the headline tier* — and still values the cheap move relatively more than Aggressive does (verified via the styrka/ekonomi priority-score ratio). Maintenance is the one that breaks away to guard the decaying rank.

---

## 8. Dashboard integration (task 7) + Why-This-Score sibling (task 8)

- **Data layer:** `maxxProfile.rankUp = buildRankUpLayer(rankCats, { profileId, score, bottlenecksV2 })` → `{ gaps, opportunities, topOpportunity, plans, bottlenecks, howToImprove }`. Added with **no UI redesign** — existing cards/modals/Focus/Tree views can read it for a small indicator (e.g. "fastest rank-up: Kondition · 3:00") whenever desired. Kept data-only deliberately: the constraint says "small indicators only / do not redesign heavily," and the live UI is auth-gated + RAM-unverifiable here, so shipping the architecture (not speculative visuals) is the safe, faithful choice.
- **`buildHowToImprove`** mirrors `buildWhyThisScore`'s shape (`version`, `headline`, list payloads) so a "How do I improve this?" affordance can sit right next to "Why this score?". Its headline exposes `fastestPath` and `biggestImpact`; the body carries `topOpportunities` + per-category `plans`. **Architecture only** — no affordance was wired into a component this phase.

---

## 9. Verification (task 9)

`scripts/rank_up_check.mjs` (esbuild bundle + node) — **36/36 pass** across **Student / Fitness / Career** personas (mapped to the matching tier-profile weight presets). Each persona's `buildRankUpLayer` yields gaps + ranked opportunities + plans + how-to-improve, with a sensible top opportunity:

```
student  top → Kondition (3:00 snabbare, +3 poäng, Snabb)
fitness  top → Plugg     (+16%,          +1.9 poäng, Måttlig)
career   top → Sömn      (+0.3h,         +1.6 poäng, Snabb)
```

Covered: rank gaps (incl. lower-is-better distance), score impact (monotonic, weakest-link dominance, baseline matches `computeMaxxScoreV2`), opportunity ranking, plan steps, the effort model (unit-rate, missing-data, progress-curve, tier difficulty), bottleneck enrichment, profile divergence, how-to-improve, and edge cases (empty → null, maxed T8 → no opportunity / `plan.atMax`, no-tier → null).

**Regression:** Tier 14/14, Maxx 15/15, Profile 24/24, Benchmark 21/21 — all unchanged. `rankUp.js` and `Dashboard.jsx` pass per-file esbuild transform. (Browser-unverified — pure logic + data layer, no visual surface added; same documented env limits as prior phases.)

---

## 10. Future Jarvis integration points (data already shaped for it)

Everything is JSON-friendly and needs **no AI** to produce — Jarvis would *narrate*, not compute:
- **`howToImprove`** → "Your fastest rank-up is Kondition: shave 3 min off your 5 k. ~3 weeks. +3 score." (`headline.fastestPath` + `topOpportunities`).
- **`buildRankUpPlan`** → a coachable checklist per category (`required[]` + `estimatedMonths`) Jarvis can turn into weekly actions.
- **`RANK_UP_PROFILES`** → "Want the aggressive plan or the sustainable one?" — Jarvis picks the `profile` arg; the engine re-ranks deterministically.
- **`enrichBottlenecks`** → "What's holding my score back?" answered with impact + effort + the exact plan.
- **`estimateScoreImpact`** → "What if I hit a T5 bench?" — a single pure call, fully explainable.

---

## 11. Remaining heuristics (honest limitations)

- **Effort rates are heuristics**, isolated in `EFFORT_RATES` / `CATEGORY_BASE_MONTHS`. Economy's "4000 kr/mån surplus" is an assumption (confidence 0.4) — the user's real savings rate isn't known to the engine yet. Measured progression data is the accuracy unlock; the seam is ready.
- **kondition/halsa effort** uses a unit-less progress curve (no clean linear unit for "seconds shaved" / composite habits) — coarser than the kg/kr/h paths.
- **Score impact is single-step** (+1 tier, one category at a time). Multi-move plans ("+1 bench AND +1 sleep") would need a combinatorial pass — deliberately out of scope.
- **Data-layer only:** no visual indicator shipped (architecture per constraints); wiring one is a small, isolated follow-up that reads `maxxProfile.rankUp`.

---

## 12. Constraints honored

No custom modules, no social, no marketplace, no Jarvis redesign, no score/tier redesign, no heavy Dashboard redesign. Phase 10 added one pure engine + a thin data layer that consumes existing Dashboard data and the existing Maxx Score weighting — fully additive and backwards-compatible.
