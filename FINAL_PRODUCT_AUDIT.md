# Final Product Audit — MaxxIt

> **Scope:** product / UX / architecture / QA review of the whole app immediately before
> deployment. **Audit only — nothing implemented, no engines built, no redesign.**
> Companion to `DEPLOY_READINESS_REPORT.md` (which covers migrations/build/deploy mechanics);
> this document covers *product quality*. Findings are grounded in the current code with
> `file:line` references so each is actionable later.

---

## Executive Summary

MaxxIt is a **mature, broad single-user life-OS** with an unusually deep intelligence spine
(Tier engine → Maxx Score v2 → Bottlenecks → Rank-Up → Explainability → Jarvis → Studier
composite → Career model). Tracking is feature-complete across 8 of 9 life domains; the
Phase 6–12 intelligence work is genuinely differentiated.

The product is **technically deploy-ready** (505/505 logic checks; see deploy report). The
gap is not stability — it's **two product-level mismatches with the stated SaaS goal**:

1. **The app still assumes it *is* Sigge.** The Jarvis edge brain, the Journal/Insights/
   side-quest/study-tutor AI prompts, a hardcoded "Erik Norling" client, and fixed income
   sources are all baked in. A second user gets *Sigge's* identity, clients and side-quests.
   This is invisible during owner testing and **blocks inviting a real second user.**
2. **The deepest intelligence is the least visible.** The Phase-15 career model
   (`src/lib/career.js`) is **imported by zero UI files** — fully built, completely hidden.
   Benchmarks ship default-OFF. Rank-Up/Explainability live one or two taps deep inside a
   modal. Much of the value the last 10 phases produced is under-surfaced.

**Verdict: 🟢 GO for live owner / early-access testing** (deploy as planned). **Conditional
NO-GO for onboarding a genuine second user** until the Part-5 personalization items are
addressed. None of this needs new systems — it's surfacing and de-personalizing what exists.

---

## Part 1 — Product Audit (fresh-user walkthrough)

### 🔴 Critical (will confuse users)

| # | Finding | Where | Why it confuses |
|---|---|---|---|
| C1 | **Jarvis greets every user as "Sigge."** The system prompt is `Du är Jarvis – Sigges AI-coach`, labels user turns "Sigge", and saves "faktum om Sigge". | `supabase/functions/jarvis-chat/index.ts:841,579,854` | A new user is addressed by, and has memories saved about, *someone else*. Immediate trust-breaker. |
| C2 | **Side-quest generator injects Sigge's whole biography** ("Han är 21, medicinsstudent i Stockholm/Täby, jobbar natt som PA … Drömmål: 100k/mån, bo i Göteborg"). | `src/pages/Upplevelser.jsx:846` | Any user clicking "generate side quests" gets *Sigge's* life as the prompt. Output is nonsensical for them. |
| C3 | **"Erik" is a first-class, hardcoded client** — own tables, own Kalender category, own income source, own TodayWidget query. | `Jobb.jsx:337–583`, `Kalender.jsx:22,103`, `QuickLog.jsx:10`, `TodayWidget.jsx:37`, `Dashboard.jsx:625` | A new user sees a stranger's client/payments scaffolding they can't remove via UI. |
| C4 | **Study tutor is hardcoded as a "medicinstudent-tutor."** | `StudyModal.jsx:177–196` | A law/engineering student gets a medical-school framing for AI exam practice. |

### 🟠 High Priority (reduces quality)

- **H1 — Career model is invisible.** `src/lib/career.js` (Phase 15: tracks, drivers, readiness,
  registry) is imported nowhere (`grep lib/career src/**` → only its own file). It produces
  zero user-facing value today. Either surface it (Jarvis card / Jobb section) or label it
  explicitly as a future foundation.
- **H2 — Skills→Studier composite is correct but unexplained.** Dashboard now blends formal
  study + skills into one "Studier" tier (`Dashboard.jsx` via `lib/studies.js`). A user with a
  high skills tier but no courses will see "Studier" move for reasons the card doesn't make
  obvious unless they open the modal's "Sammansättning" block.
- **H3 — Insights weekly report is hardcoded to Sigge's domains and voice**
  (`Insights.jsx:410–412`: "Analysera Sigges senaste vecka … träning, plugg, hälsa, ekonomi").
  Works, but the persona leak is visible in generated text.
- **H4 — Journal AI extraction prompt references "Sigges kända beteendemönster"**
  (`Journal.jsx:9–18,264`). Extraction still works, but the model is told it's analysing Sigge.
- **H5 — Two nav surfaces, two orderings.** Sidebar lists 12 items in one order; BottomNav
  splits 4 primary + 9 "Mer". Journal is primary-adjacent on desktop but buried under "Mer" on
  mobile. Mental model differs by device.

### 🟡 Medium Priority (can wait)

- **M1 — Onboarding doesn't mention the Maxx Score or tiers.** Steps are Welcome → Profile →
  Personalize tiers → Goals → Jarvis → Done (`Onboarding.jsx:8–13`). A new user lands on a
  Dashboard dominated by a "Maxx Score" concept never named during onboarding.
- **M2 — Income sources are a fixed list** (`QuickLog.jsx:10`, `Dashboard.jsx:625`:
  `['PA-jobb','Erik Norling','CSN',…]`). Fine for Sigge; a freelancer can't pick their own.
- **M3 — Benchmarks ship OFF** (`benchmarksEnabled() === false`). The percentile/"top X%"
  language exists across the UI but is inert; users may see "top %" copy with no data behind it
  depending on code paths. Confirm no dangling benchmark UI renders while OFF.
- **M4 — Export page is raw-data only** — useful for the owner, opaque ("Exportera") to a new
  user with no explanation of what/why.

### ⚪ Low Priority (nice-to-have)

- L1 — Loading copy is charming but Swedish-only ("Startar instrumentpanelen…"); fine if the
  product stays Swedish, a gap if not.
- L2 — `/export` and `/installningar` both expose preferences-ish surfaces; minor overlap.
- L3 — No empty-state guidance is guaranteed on first login for pages with zero data (Training,
  Economy) — `EmptyState.jsx` exists; verify it's wired on every page.

---

## Part 2 — Visibility Audit (is the intelligence findable?)

For each major system: **Aware?** (does a user know it exists) / **Findable?** / **Obvious why
it matters?** / **Underutilized?**

| System | Aware | Findable | Why-it-matters obvious | Underutilized | Notes |
|---|---|---|---|---|---|
| Profile Engine | ✅ | ✅ `/profil` + onboarding | ⚠️ | No | Drives tiers but users don't see the causal link. |
| Personalization (tier weights) | ⚠️ | ⚠️ onboarding step 2 only | ❌ | **Yes** | Set once, never resurfaced; users forget it shapes scores. |
| Tier Engine | ✅ | ✅ Dashboard cards | ✅ | No | Best-surfaced system. |
| Benchmark Engine | ❌ | ❌ (default-OFF) | ❌ | **Yes (fully dormant)** | Built (Phase 9), shipping invisible by design. |
| Maxx Score | ✅ | ✅ Dashboard hero | ✅ | No | Strong. |
| Bottlenecks | ⚠️ | ⚠️ inside DetailModal | ✅ when found | **Yes** | High-value, buried a tap deep. |
| Rank-Up Plans | ⚠️ | ⚠️ inside DetailModal | ✅ when found | **Yes** | Same — the "how do I improve" answer is hidden. |
| Explainability (Phase 12) | ⚠️ | ⚠️ modal only | ✅ | **Yes** | Excellent content, requires opening a category. |
| Jarvis Intelligence | ✅ | ✅ nav + deep links | ✅ | No | Well-surfaced; the deep-link prompts (Phase 12) are a highlight. |
| Studier Composite | ⚠️ | ✅ Dashboard | ❌ (blend not labelled on card) | Partly | See H2. |
| **Career Architecture** | ❌ | ❌ **imported nowhere** | ❌ | **100% — zero surface** | Biggest hidden asset. |

### Hidden value (highest first)
1. **Career model** — a complete readiness/driver/registry engine with *no entry point*.
2. **Rank-Up + Bottlenecks** — the app's "what should I do next" answer lives two taps deep.
3. **Benchmarks** — an entire percentile engine dormant behind a flag.
4. **Personalization** — shapes every score, surfaced once and never again.

---

## Part 3 — Consistency Audit (terminology / naming / navigation)

| Issue | Evidence | Recommendation (do not implement) |
|---|---|---|
| **Plugg vs Studier split** | Label says "Studier" (`Sidebar.jsx:18`, `BottomNav.jsx:19`); route is `/plugg`; file is `Plugg.jsx`; **Jarvis still links `[Plugg](/plugg)`** (`jarvis-chat/index.ts:859`). | Pick "Studier" as the product word everywhere user-visible; align the Jarvis link label. Keep internal id/route `plugg` (low-risk) but document it. |
| **Jobb vs Career** | Page is "Jobb" (work execution); Phase-15 model calls it "Karriär/career". | Decide whether Career is a section *of* Jobb or its own concept before surfacing `career.js`. Don't introduce a third label. |
| **Goals live in two stores** | `user_settings.goals` JSON **and** `learning_goals` (mastery). | Consolidate behind one accessor before any goals UI (flagged in Phase 13 as the top duplication risk). |
| **"Erik" as both a person and a category** | `Kalender.jsx:22` category `erik`; tables `erik_*`. | Generalize to a generic `clients` concept; "Erik" becomes data, not schema. |
| **Income source naming** | Hardcoded list incl. "Erik Norling", "CSN" (Swedish student aid). | User-editable sources. |
| **Projects vs Experiences vs Side-quests** | `projects` (Jobb), `adventures`/`trips` (Upplevelser), `side_quests`. | Naming is actually distinct enough; **no change needed** — these are genuinely different concepts. |

---

## Part 4 — Mobile Audit

Observations from the layout code (verify visually at 390px during smoke-test; per memory,
full visual verification is via dev-server preview, not prod build):

| Area | Risk | Severity | Note |
|---|---|---|---|
| **Nav model differs by device** | Medium | 🟠 | 4 primary + "Mer" sheet (`BottomNav.jsx:9–26`) vs 12-item rail. Frequently-used pages (Ekonomi, Studier, Insights) are all behind the "Mer" tap. |
| **Dashboard density** | Medium | 🟠 | Dashboard is 70KB/very feature-dense (hero score + constellation + Today + focus/tree + weekly review + achievements). On a phone this is a long scroll; confirm no horizontal overflow on the constellation. |
| **Modals (DetailModal + InsightSections)** | Medium | 🟠 | The category modal now stacks Why-Tier + Sammansättning + Bottleneck + Rank-Up + benchmark + all-tiers. On mobile this is a tall modal — verify it scrolls within the sheet and the close affordance stays reachable. |
| **Extra taps to value** | Medium | 🟠 | "How do I improve" = open modal → scroll to Rank-Up. On mobile that's 1 tap + scroll past several sections. Consider a Dashboard-level shortcut later. |
| **Bottom-sheet "Mer" overlay** | Low | 🟡 | Inline-styled, `repeat(3,1fr)` grid — fine; 9 items fit. |
| Safe-area handling | OK | ✅ | `env(safe-area-inset-bottom)` is respected in BottomNav. |

**Priority order:** modal scroll/length on phones → Dashboard vertical density → nav parity.

---

## Part 5 — Multi-User Audit (student / professional / entrepreneur)

This is the audit with the **most deployment-relevant findings.** RLS/data isolation is solid
per the deploy report — the problem is **content personalization**, not data leakage.

### Sigge-specific assumptions still in code
| Assumption | Location | Affects |
|---|---|---|
| Jarvis identity = "Sigge" (prompt, turn labels, memory writes, "Erik-uppdrag" tool copy) | `jarvis-chat/index.ts:841,579,854,122,637–649,859` | **All users** |
| Side-quest prompt = Sigge's full bio | `Upplevelser.jsx:846` | All users |
| Journal extraction = "Sigges beteendemönster" | `Journal.jsx:9–18,264` | All users |
| Weekly report = "Sigges senaste vecka" | `Insights.jsx:410–412` | All users |
| Study tutor = "medicinstudent-tutor" | `StudyModal.jsx:177–196` | All students |
| "Erik Norling" hardcoded client + tables + category | `Jobb.jsx`, `Kalender.jsx`, `QuickLog.jsx`, `TodayWidget.jsx`, `Dashboard.jsx` | All users |
| Fixed income sources (PA-jobb/Erik/CSN) | `QuickLog.jsx:10`, `Dashboard.jsx:625` | All users |

### Not profile-aware (should be, but isn't)
- AI prompts don't interpolate the user's `display_name`, `occupation`, `study_program`, or
  `life_stage` — even though the profile engine already has these fields. The data exists; the
  prompts ignore it in favour of hardcoded Sigge facts.
- Study tutor framing ignores `study_program`.
- Side-quest generation ignores actual trips/goals in favour of a static bio string.

### Already profile-aware (credit where due) ✅
- Tier weighting (`tierProfiles.js`), Studier composite weighting (`studies.js`), and the
  career registry (`career.js`, healthcare/engineering/business/… not medicine-hardcoded) are
  all correctly generalized. The *intelligence layer* is multi-user-ready; the *prompt/content
  layer* is not.

### Recommendation (do not implement)
Before a real second user: (1) replace hardcoded "Sigge" in all 5 prompt sites with the
profile `display_name` + a neutral fallback; (2) make the study-tutor framing read
`study_program`; (3) make side-quests consume profile/goals instead of the bio string;
(4) generalize `erik_*` → a `clients` concept; (5) make income sources user-editable. All are
**substitutions, not new systems.**

---

## Part 6 — Technical Debt Audit

| Item | Severity | Detail |
|---|---|---|
| **Oversized page components** | 🟠 High | `Traning.jsx` 132KB, `Plugg.jsx` 92KB, `Dashboard.jsx` 70KB, `Upplevelser.jsx` 66KB, `Ekonomi.jsx` 56KB, `Jobb.jsx` 53KB. Each is a monolith mixing data-fetch + state + render. Hard to test, slow to reason about. Lazy-loaded (good), but individually heavy. |
| **Hardcoded persona in prompts** | 🔴 Critical (for SaaS) | Covered in Part 5 — also a maintenance smell: persona facts duplicated across 5 files instead of one prompt-builder. |
| **`erik_*` schema as bespoke tables** | 🟠 High | A person modelled as 3 dedicated tables + UI is the single biggest "don't copy this pattern" risk. Generalize before adding any second client. |
| **Goals split across two stores** | 🟠 High | `user_settings.goals` JSON + `learning_goals`; adding goal UI without consolidating makes it a 3-way split. |
| **Dead-but-intentional code** | 🟡 Medium | `career.js` fully built, imported nowhere. Acceptable as staged foundation **if labelled**; otherwise reads as dead code. |
| **Benchmarks dormant** | 🟡 Medium | Whole subsystem behind `benchmarksEnabled()===false`. Fine, but it's untested-in-prod surface area shipping dark. |
| **Two nav configs to keep in sync** | 🟡 Medium | Sidebar + BottomNav maintain separate item lists; easy to drift (already differ in ordering/grouping). |
| **Inline styles in BottomNav/others** | ⚪ Low | Large inline style objects vs the CSS-variable system used elsewhere; cosmetic inconsistency. |
| **Build/lint can't run locally** | ⚪ Low (env) | RAM-constrained machine; Vercel CI is the real gate (documented). Not a code defect. |

**No refactor performed.** Scalability risk is concentrated in the monolithic pages and the
`erik_*`/persona hardcoding — none block owner deployment.

---

## Part 7 — Deployment Recommendation

### 🟢 GO — for live owner / early-access (single-user) testing.
Deploy exactly as `DEPLOY_READINESS_REPORT.md` specifies (migrations → edge functions →
frontend; the migration-before-frontend gate is mandatory). Stability, data isolation, and
logic are verified. As the owner testing your own account, every "Sigge" assumption is correct,
so nothing here blocks your stated goal of testing live.

### 🔴 Conditional NO-GO — for inviting a genuine second user.
Do **not** hand the live URL to a non-Sigge user until the Part-5 items are addressed — they'd
be greeted as Sigge, get Sigge's side-quests, and see Erik's client scaffolding. These are
content/personalization fixes, not architecture, and don't require new systems.

### Top 10 improvements to consider *after* deployment (ROI-ordered)
1. **De-personalize the 5 AI prompt sites** (Jarvis edge, Journal, Insights, side-quests,
   study tutor) — interpolate profile, drop hardcoded "Sigge". *Unlocks multi-user.*
2. **Surface the Career model** — give `career.js` a home (Jobb section or Jarvis card).
   *Recovers fully-built, fully-hidden value.*
3. **Promote Bottlenecks + Rank-Up to the Dashboard surface** (not just inside the modal) —
   the "what do I do next" answer should be one glance, not two taps.
4. **Generalize `erik_*` → a `clients` concept** — removes the biggest Sigge-specific schema.
5. **Make income sources & study-tutor framing user-editable / profile-driven.**
6. **Name the Maxx Score in onboarding** — close the onboarding→dashboard concept gap.
7. **Resurface Personalization** beyond the one-time onboarding step (a "tune my tiers" entry).
8. **Decide on Benchmarks** — either light up with honest data or hide the "top %" copy paths.
9. **Unify the Goals store** before any goals UI (top duplication risk per Phase 13).
10. **Mobile pass on the category modal + Dashboard density** — verify scroll/overflow at 390px.

---

## Recommended Roadmap (after real-world testing)

- **Stage 0 (pre-second-user):** items 1, 4, 5 above — the multi-user gate.
- **Stage 1 (value recovery):** items 2, 3, 7 — surface what's already built.
- **Stage 2 (polish):** items 6, 8, 10 — onboarding clarity, benchmark decision, mobile.
- **Stage 3 (debt):** items 9 + split the 3 largest page monoliths as they next need changes
  (opportunistic, not a dedicated refactor sprint).

All Stage-0/1 work is **surfacing and substitution** of existing systems — consistent with the
"extend, don't build" principle that has governed every phase. No new engines required.

---

*Audit only. No code changed, no systems built, no UI redesigned.*
