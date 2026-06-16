# Phase 14 Report — Skills Integration Into Studies

> **Scope:** fold the **already-existing** Skills/Färdigheter system into the existing study domain — renamed user-facing **Plugg → Studier** — as a *sub-dimension*, not a new category. No new page, no new tracker, no new table, **no 7th Maxx category**. The composite replaces the `plugg` tier **in place** (internal id unchanged), so Maxx Score / Rank Up / Bottleneck consume it with zero parallel logic.

---

## 1. Existing skills functionality discovered (task 1 audit)

| Asset | State before Phase 14 | Decision |
|---|---|---|
| `skill_logs` table | `{date, skill, minutes}`; skills hard-coded as `spanish` / `serbian` / `guitar` | **Reuse unchanged** |
| `getSkillTier(min/week)` | tiers 0 (Inaktiv) → 6 (Mästare): 30/60/120/240 min/wk ladder | **Reuse unchanged** |
| Dashboard skill calc | `spM/srM/gtM` (avg min/wk) → `getSkillTier` → `skTop` (best skill), `skH`, `skillLevelUp` | **Reuse — was DEAD** |
| `fardigheter` category | computed but **never pushed into `cats`**, and explicitly excluded by `rankCats` filter | **Promote into Studier** |
| `getStudyTier` / `calculateStudyTier(mastery)` | formal study tier (1–5) from course mastery | **Reuse as formal source** |

**Critical finding:** the skills tier was fully computed every render but **surfaced nowhere** and **excluded from the score**. Phase 14 wires that existing output into the study category — it adds *visibility + scoring*, not tracking.

---

## 2. Rename Plugg → Studier (task 2) — product-language only

User-facing labels changed; **route `/plugg`, table names, snapshot column `plugg`, and internal category id `plugg` all UNCHANGED** (renaming them would break `tier_snapshots`, RankUp `RANKABLE_IDS`, deep links and history). Touched:
- `Dashboard.jsx` — category `name: 'Studier'`, `navLabel: 'Studier'`, graph legend label
- `Sidebar.jsx`, `BottomNav.jsx`, `CommandPalette.jsx` (kept `plugg`/`utbildning` as search keywords)
- `Insights.jsx` (section header, stat card, correlation label, Jarvis line), `Kalender.jsx` (`Studiedeadline`)
- `lib/jarvis/index.js` (snapshot display name), `lib/achievements.js` (group), `Plugg.jsx` (page title)

---

## 3. Composite architecture (tasks 3–5) — `src/lib/studies.js` (NEW, pure)

```
  calculateStudyTier(mastery) ─┐
   (courses/exams/mastery)     │   computeStudiesTier({formalTier, skillTier, lifeStage, primaryFocus})
                               ├──▶  → { tier, label, color, weights, parts, mode, summary }
  skTop = max(getSkillTier)  ──┘        (profile-aware blend; replaces the plugg tier in place)
   (skill_logs min/week)

  buildStudiesLevelUp(tier, studyLevelUp, skillLevelUp)
     → ONE merged levelUp (mastery + language reqs, source-tagged)
     → feeds the EXISTING Rank Up + Bottleneck engines unchanged
```

The Dashboard sets the `plugg` category's `tier` = composite, `name` = "Studier", `composite` = the breakdown object, and `levelUp` = the merged plan. `hasData` is now true when **either** formal studies **or** skills exist — so a professional who only practises languages now gets a ranked Studier tier (previously empty).

### Final weighting model (task 4)

| Situation | Formal | Skills | Detected by |
|---|---|---|---|
| **Student** | 70% | 30% | `life_stage==='student'` or `primary_focus∈{education,studies}` |
| **Professional** | 30% | 70% | `life_stage∈{professional,entrepreneur,early_career}` or `primary_focus∈{career,wealth}` |
| **Balanced** (default) | 50% | 50% | anything else |
| **No formal studies** | 0% | 100% | no mastery data |
| **No skills** | 100% | 0% | skill tier 0 / no `skill_logs` |

`composite tier = clamp(round(wFormal·formalTier + wSkills·skillTier), 1, 8)`. **Not a flat average** — it's profile-aware, reuses `suggestTierProfile`'s persona mapping, and uses `skTop` (the *best* skill) so a serious guitarist isn't dragged down by a beginner language.

### Maxx Score integration (task 5) — one category, not two

Verified: the score still has **exactly 6 rankable categories** (`RANKABLE_IDS` unchanged), the composite tier flows into `computeMaxxScoreV2` as the single `plugg` contribution, and **no `skills`/`fardigheter` id ever appears** in the contributions. No seventh category.

---

## 4. Score impact analysis

Folding skills in changes the Studier tier for anyone with skill data (previously skills were invisible). Examples from verification:
- **Student** formal T3 + best-skill T5 → 0.7·3 + 0.3·5 = **3.6 → T4** (skills lift a study-heavy profile slightly).
- **Professional** formal T2 + skills T5 → 0.3·2 + 0.7·5 = **4.1 → T4** (skills dominate, as intended).
- **No-formal professional** skills T4 → **T4** (previously: no Studier tier at all — a strict improvement in coverage).

The blend is deterministic and bounded to ±(skill−formal)·weight of the old formal-only tier, so Maxx Score stays stable (no wild swings, still 1–8, recomputes cleanly). **Tradeoff noted:** a high formal tier can dip one tier when a *new* low-tier skill is picked up; `skTop` mitigates this, and a "skills may only add" variant is flagged in §future.

---

## 5. Explainability changes (task 6) — reuses Phase-12 surface

The composite breakdown is threaded through the existing pipeline (`getJarvisUserContext` projection → `insight.buildCategoryInsight` → `InsightSections`). The Studier DetailModal now answers, inside the existing **"Varför denna tier?"** section:
- **How much comes from formal studies vs skills** — a "Sammansättning" block with a weight bar + tier per source (e.g. "Formella studier 70% · T3 / Färdigheter 30% · T5") and a one-line summary.
- **Why this tier / next rank / fastest improvement** — unchanged Phase-12 machinery (`explainTier`, confidence, rank-up plan, opportunity), now driven by the composite.

No new explainability code path — only one breakdown card added to the existing section, and one field (`composite`) added to the shared projection (null for every other category, so nothing else changes).

---

## 6. Rank-up & 7. Bottleneck changes — no parallel logic

`buildStudiesLevelUp` merges the existing formal `studyLevelUp.requirements` (mastery) and `skillLevelUp.requirements` (the three languages) into **one** `levelUp`, each requirement source-tagged (`formal` / `skills`). Because the Phase-10 Rank Up engine consumes `levelUp.requirements` generically:
- **Rank Up Plans** now generate actions from *both* sources (improve mastery **and** reach the next language milestone) under one Studier plan.
- **Bottleneck Engine v2** treats Studier exactly as before — it can become the weakest link, produce an opportunity, and get a score-impact estimate — with no Studier-specific code. Verified for all three profiles.

---

## 8. Files changed

**Added:** `src/lib/studies.js` (composite engine), `scripts/studies_integration_check.mjs` (**51/51**).
**Modified:** `src/pages/Dashboard.jsx` (composite compute + Studier category), `src/lib/jarvis/context.js` (project `composite`), `src/lib/insight.js` (carry `composite`), `src/components/dashboard/InsightSections.jsx` (Sammansättning card + `CompositePart`), plus label renames in `Sidebar.jsx`, `BottomNav.jsx`, `CommandPalette.jsx`, `Insights.jsx`, `Kalender.jsx`, `lib/jarvis/index.js`, `lib/achievements.js`, `Plugg.jsx`.
**No migration, no table/route/id rename, no edge-function change.**

---

## 9. Verification (task 9)

`scripts/studies_integration_check.mjs` — **51/51** across **Student / Professional / No-formal**. Asserts: the weighting model (all six modes), composite tier logic (student vs professional weighting, skills-only, inactive-skill handling, clamping, null-when-empty), **exactly 6 rankable categories / one `plugg` entry / Studier in contributions / no standalone skills id**, the score uses the composite tier, the merged levelUp carries source-tagged formal+skills reqs, and Studier still produces a rank-up plan + opportunity + participates in bottleneck detection.

**Regression:** tier 14/14, maxx 15/15, profile 24/24, benchmark 21/21, rankup 36/36, jarvis 48/48, insight 243/243 — **all unchanged**. All changed files pass per-file esbuild transform. **Browser-unverified** (auth-gated + RAM-wedged dev server, documented env limit); the change is additive and falls back to the formal-only tier when no composite exists.

---

## 10. Recommendation for future evolution

- **"Skills may only add, never subtract"** — optionally floor the composite at the formal tier (`max(formalTier, weighted)`) so picking up a new beginner skill never lowers a strong student's rank. Cheap, one-line; deferred because the spec asked for a weighted model and `skTop` already softens it.
- **De-hardcode skills** — `skill_logs` skills are fixed to `spanish/serbian/guitar`; a small `skills` reference (or a `goals.active_skills` list, mirroring `active_supplements`) would let any user define their own. No new tracker — just a config list.
- **Certifications** (Phase 13 gap) — add a credential type to `skill_logs` or a light `certifications` sibling and feed it into the skills sub-dimension; still no separate Competence category.
- **Skill decay** — running times already decay; skills could reuse `getDecayedValue` so a long-abandoned language drops, matching reality.

## Constraints honored
No separate Competence category, no 7th Maxx category, no duplicated Plugg functionality, no new tracker/table. Skills became a **sub-dimension of Studier**; the rename was product-language only; everything routes through the existing tier/score/rank-up/bottleneck/explainability infrastructure.
