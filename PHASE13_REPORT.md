# Phase 13 Report — Domain Audit & Expansion Strategy

> **Scope:** discovery only. Understand what MaxxIt already covers *before* anyone builds new life domains. **No new functionality built this phase.** The deliverable is this inventory + gap analysis + roadmap. Guiding rule throughout: **extend before you create** — the codebase already has study, experience, goal, journal, project, health, training and economy systems; new work must not duplicate them.

---

## 1. Full Domain Inventory

### 1a. Pages / routes (14 app routes + 3 auth)

| Route | Page | Purpose | Primary data | Maturity |
|---|---|---|---|---|
| `/` | Dashboard | Maxx Score, tier constellation, focus/tree views, Today, weekly review, achievements, **Phase-12 explainability modal** | reads all category tiers + `tier_snapshots` | **Mature** |
| `/jarvis` | Jarvis | AI coach; consumes the grounded MAXX INTELLIGENS context (Phase 11), tools, insights, deep links (Phase 12) | `jarvis_conversations`, `jarvis_insights` | **Mature** |
| `/journal` | Journal | Daily journal + AI extraction → mood/energy/people/keywords; **writes `social_interactions`** | `journal_entries`, `social_interactions`, `skill_logs`, `daily_scores`, `health_logs` | **Mature** |
| `/traning` | Träning | Gym + running; sessions, exercises, e1RM PRs, Strava best efforts, exercise library | `training_sessions`, `training_exercises`, `personal_records`, `run_personal_records`, `exercise_*`, `muscle_groups` | **Mature** (2380 LOC) |
| `/halsa` | Hälsa | Daily weight/sleep/energy/mood/steps/alcohol, nutrition, supplements | `health_logs`, `nutrition_logs`, `supplement_logs` | **Mature** |
| `/ekonomi` | Ekonomi | Income, expenses, fixed costs, assets, net-worth history; trip budget link | `income_logs`, `expense_logs`, `fixed_costs`, `assets`, `net_worth_history`, `trips` | **Mature** |
| `/plugg` | Plugg | Courses, exams, materials, learning goals (mastery), study sessions/tasks, mandatory sessions | `courses`, `course_exams`, `course_materials`, `exam_old_files`, `learning_goals`, `study_sessions`, `study_tasks`, `study_task_deadlines`, `mandatory_sessions` | **Mature** (1339 LOC) |
| `/jobb` | Jobb | Work/career: PA-shifts (hours/pay), generic projects + tasks, **client mgmt (Erik: tasks/payments/contact log)** | `pa_shifts`, `projects`, `project_tasks`, `erik_tasks`, `erik_payments`, `erik_contact_log`, `income_logs` | **Mature but bespoke** |
| `/upplevelser` | Upplevelser | Experiences: adventures (rated), trips (full travel planner + budget), Jarvis-suggested side-quests, world map | `adventures`, `side_quests`, `trips`, `worldPaths.js` | **Mature** |
| `/kalender` | Kalender | Unified month calendar overlaying exams, shifts, study deadlines, trips, training, journal, mandatory sessions | reads 9 tables (no own table) | **Mature (aggregator)** |
| `/insights` | Insights | Analytics/patterns: PR history, training/study frequency, exam pressure, cross-domain signals | reads 10 tables (no own table) | **Medium (read-only analytics)** |
| `/export` | Export | Raw-data export for backup / Jarvis audit | client-side export | **Utility** |
| `/profil` | Profile | Identity/body/life-stage/goals (Phase 5 profile engine), avatar | `profiles`, `user_settings`, `avatars` | **Mature (Phase 5/8)** |
| `/installningar` | Settings | Preferences, goals JSON, supplements, theme, PWA install | `user_settings` | **Mature** |

### 1b. Intelligence modules (`src/lib/`) — the analysis spine

`maxxScore.js` (v2 score + bottlenecks + why-this-score), `tierEngine.js` (per-category profile-aware tiers), `tierProfiles.js` (weight presets), `rankUp.js` (gap/opportunity/plan/effort — Phase 10), `benchmarks/` (dataset registry + percentile engine, default-OFF — Phase 9), `profileCompleteness.js` (Phase 8 confidence), `personalization.js` + `profileTemplates.js` (Phase 5), `jarvis/` (context + reason — Phase 11), `insight.js` (Phase 12 UI adapter), `achievements.js`, `worldPaths.js`, `supabase.js`.

### 1c. Database tables (~45) by cluster

- **Training (9):** training_sessions, training_exercises, personal_records, run_personal_records, exercise_library, exercise_aliases, exercise_muscles, muscle_groups, exercise_library_with_muscles (view)
- **Health (3):** health_logs, nutrition_logs, supplement_logs
- **Economy (5):** income_logs, expense_logs, fixed_costs, assets, net_worth_history
- **Education/Competence (11):** courses, course_exams, course_materials, exam_old_files, learning_goals, study_sessions, study_tasks, study_task_deadlines, tenta_sessions, mandatory_sessions, skill_logs
- **Career/Work (6):** projects, project_tasks, pa_shifts, erik_tasks, erik_payments, erik_contact_log
- **Relationships (1):** social_interactions
- **Experiences (3):** adventures, side_quests, trips
- **System / cross-cutting (7):** profiles, user_settings (holds the **goals JSON**: future_plan / one_year / three_year / ten_year / monthly_income_goal / net_worth_goal / target_weight …), tier_snapshots, daily_scores (**incl. `score_social` + `peak_mode`**), journal_entries, jarvis_conversations, jarvis_insights, + `avatars` storage bucket

---

## 2. Domain Mapping

| Canonical domain | Covered by | Scored in Maxx? |
|---|---|---|
| **Health** | Hälsa + `health_logs`/`nutrition`/`supplement`; tiers `somn` (sleep) + `halsa` (wellbeing) | ✅ 2 tiers |
| **Training** | Träning + 9 tables; tiers `kondition` + `styrka` | ✅ 2 tiers |
| **Economy** | Ekonomi + 5 tables; tier `ekonomi` (income+savings weak-link) | ✅ 1 tier |
| **Education / Competence** | Plugg + 11 tables; tier `plugg` (mastery). Skills via `skill_logs` + `getSkillTier` (`fardigheter`) | ⚠️ study tier only; **skills tier exists but EXCLUDED from Maxx** |
| **Career** | Jobb (projects/tasks/PA-shifts/client) + income + Profile occupation/goals | ❌ not a Maxx tier |
| **Relationships** | `social_interactions` (AI-extracted from Journal) + `daily_scores.score_social` + Calendar | ❌ not a Maxx tier; thinnest layer |
| **Experiences** | Upplevelser (adventures/trips/side_quests) | ❌ tracked, not scored |
| **Projects** | generic `projects`/`project_tasks` (Jobb) | ❌ |
| **Productivity** | tasks across study/project/erik/side_quests + `daily_scores` | ❌ no unified tracker/score |

**Key structural fact:** the Maxx Score ranks **6 categories** (`kondition, styrka, somn, ekonomi, halsa, plugg` — see `rankUp.RANKABLE_IDS`). Everything else is *tracked* but not *ranked*. So "expansion" almost always means **promoting an already-tracked domain into the tier/score system**, not building a new tracker.

---

## 3. Gap Analysis

**A) Fully covered (page + data + Maxx tier):** Health, Training, Economy, Education(study).

**B) Partially covered:**
- **Competence/Skills** — `skill_logs` + `getSkillTier` (`fardigheter`) already exist (Spanish/Serbian/Guitar), but are **excluded from the Maxx Score**. No certifications, no project-as-competence link. *Gap = surfacing/scoring, not tracking.*
- **Career** — Jobb has work execution (shifts, projects, a hard-coded client). Missing: a **career progression model** (role/title/seniority/salary trajectory/skills-to-role mapping). Income already lives in Economy. *Gap = a progression abstraction, not a work tracker.*
- **Experiences** — full tracker exists; missing only **analysis/scoring** (variety, novelty, cadence). *Gap = analyzable layer.*
- **Productivity** — tasks exist in 4 places; missing a **unified completion/consistency view**. *Gap = aggregation, not new task tables.*

**C) Missing (no dedicated home):**
- **Relationships** — the genuine gap. Only `social_interactions` (passive, AI-extracted from journal) + `daily_scores.score_social`. No people/contacts model, no cadence ("haven't seen X in N weeks"), no relationship tier. This is the **only domain that could justify a new system** — and even then it should extend `social_interactions`.

*(Per instructions, no solutions implemented here.)*

---

## 4. Rankable / Trackable / Analyzable Audit

- **Trackable** = user logs structured data.  **Analyzable** = patterns/insights derivable.  **Rankable** = maps to a tier/percentile vs a standard.

| Feature | Rankable | Trackable | Analyzable | Rationale |
|---|---|---|---|---|
| Training (strength/conditioning) | ✅ (live tiers) | ✅ | ✅ | objective standards (e1RM×BW, run times) — ideal to rank |
| Sleep / Wellbeing | ✅ | ✅ | ✅ | norms exist (sleep hours, energy/mood) |
| Economy | ✅ | ✅ | ✅ | income/savings distributions |
| Study (mastery) | ✅ | ✅ | ✅ | mastery % ladder |
| **Skills (`skill_logs`)** | ⚠️ tier exists, **unranked in Maxx** | ✅ | ✅ | minutes/week ladder present; just not wired into the score |
| Career / work | ⚠️ weakly | ✅ | ✅ | hours/income trackable; "rank" needs a role/seniority standard that doesn't exist yet |
| Experiences | ⚠️ possible | ✅ | ⚠️ underused | could rank on variety/cadence; currently rating-only |
| Relationships | ⚠️ sensitive | ⚠️ partial | ✅ | quality 1-10 captured; ranking people is ethically/UX-fraught — prefer *analyze*, not *rank* |
| Projects / tasks | ❌ | ✅ | ✅ | completion/throughput is analyzable, not a tier |
| Journal | ❌ | ✅ | ✅ | qualitative; feeds analysis, not a rank |

**Takeaway:** the two cleanest "promote to rankable" candidates are **Skills** (a tier already exists — lowest-effort win) and a **future Career standard**. Relationships should be **analyzable, not rankable**.

---

## 5. Career Audit

**Already exists:** `/jobb` page — PA-shifts (hours + estimated/actual pay), generic `projects` + `project_tasks`, a bespoke client module (`erik_tasks`/`erik_payments`/`erik_contact_log`), `income_logs` (shared with Economy), and Profile fields (`occupation`, `primary_focus`, plus `goals.future_plan`/`one_year`/`three_year`/`ten_year` vision goals in `user_settings.goals`).

**Missing only:** a **career progression abstraction** — current role/title, seniority, target role, skills-needed-vs-have, and a salary trajectory view. There is execution data but no "where am I on my career arc" model.

**Do not build yet.** When built: **extend** `projects`/Profile/goals; do **not** create a parallel project or income system. The hard-coded `erik_*` client tables are a **generalization candidate** (→ a generic `clients` concept) rather than a template to copy.

## 6. Competence Audit

**Already exists:** Plugg (courses/exams/materials/learning_goals/study_sessions) is a complete formal-education system; `skill_logs` + `getSkillTier` cover informal skill practice (languages, guitar); `projects` can act as applied competence.

**Missing only:** **certifications/credentials** (none), and the fact that the **skills tier is computed but excluded from the Maxx Score**. Language-learning "ideas" are just `skill_logs` minutes — no curriculum/streak model.

**Do not build yet.** When addressed: **extend** `skill_logs` (add a cert/credential type or a `certifications` sibling) and consider wiring `fardigheter` into the score — do **not** duplicate Plugg.

## 7. Relationship Audit

**Already exists:** `social_interactions` (date, `friend_names[]`, activity, `quality` 1-10, notes, `source`) — populated automatically by the **Journal AI extraction**; `daily_scores.score_social`; Calendar/journal context.

**Genuinely missing:** a **people/contacts entity** (who matters, cadence, last-seen), any **relationship surface** (no page, no Dashboard presence), and intentional logging (today it's a passive byproduct of journaling).

**This is the one real domain gap.** Recommendation (Phase ≥14): **extend `social_interactions`** into a light relationships layer (a `people` table + cadence analysis) — **analyze, don't rank**. Avoid anything that scores or gamifies humans.

## 8. Experience Audit

**Already exists:** Upplevelser is feature-complete — `adventures` (title/date/location/category/rating), `trips` (countries/dates/status/budget_items/highlights/rating + world map), `side_quests` (Jarvis-suggested micro-challenges with status).

**Expansion needed?** **No new tracking.** Only an **analyzable layer** is missing: novelty/variety, cadence ("X weeks since a new experience"), and surfacing experiences on the Dashboard/Insights. That's an Insights extension, not a new system.

---

## 9. Future Architecture Recommendations

| Proposed area | Recommendation | Justification |
|---|---|---|
| **Skills → Maxx Score** | **Extend** (`fardigheter`/`skill_logs` + `rankUp.RANKABLE_IDS`) | Tier math already exists; wiring it in is the lowest-effort, highest-coherence win. No new tables. |
| **Relationships layer** | **Extend** `social_interactions` (+ small `people` table); analyze-only | Real gap, but a tracker + score already partially exist; a parallel system would fragment data and risk gamifying people. |
| **Career progression** | **Extend** Profile/goals + generalize `erik_*` → generic clients | Execution + income already exist; only the progression abstraction is missing. Duplicating projects/income is the main risk. |
| **Certifications** | **Extend** Plugg or `skill_logs` | Plugg owns formal learning; a cert is a credential type, not a new domain. |
| **Experiences analysis** | **Extend** Insights + Dashboard | Tracking is done; only analysis/surfacing is missing. |
| **Productivity view** | **Extend** Insights (aggregate existing tasks) | Tasks live in 4 tables already; build a read-only roll-up, never a new task system. |
| **Unified Goals** | **Extend / consolidate** `user_settings.goals` JSON + `learning_goals` | Goals are split between a JSON blob and study mastery; consolidate before adding goal UI — do **not** invent a third goal store. |
| **Net-new system** | **Only Relationships, conditionally** | It's the sole domain without a real home — and even it should extend, not replace. |

---

## 10. Roadmap & duplication risks

### Recommended roadmap (ordered by coherence × effort)
1. **Phase 14 — Skills into the Score** (extend): wire `fardigheter` into `RANKABLE_IDS`/weights; surface via the existing Phase-12 modal. *Lowest effort, no new tables.*
2. **Phase 15 — Experiences & Productivity analysis** (extend Insights): novelty/cadence + task roll-up. *Read-only, no new tables.*
3. **Phase 16 — Goals consolidation** (extend): unify `user_settings.goals` + `learning_goals` behind one accessor before any goal UI.
4. **Phase 17 — Career progression** (extend): role/seniority/target on Profile; generalize `erik_*` → clients.
5. **Phase 18 — Relationships** (extend `social_interactions`, analyze-only): the one conditional net-new surface; people + cadence, never a rank.

### Duplication risks to guard against
- **Goals** are already in two places (`user_settings.goals` JSON + `learning_goals`) — a new goal system would make it three. **Highest duplication risk.**
- **Income** is shared by Economy and Jobb — any career build must reuse `income_logs`, not re-log pay.
- **Projects/tasks** exist generically (`projects`/`project_tasks`) plus the bespoke `erik_*` — generalize, don't fork.
- **Relationships** already have a passive tracker (`social_interactions`) + a daily score (`score_social`) — extend both rather than start fresh.
- **Experiences** are fully tracked — resist the urge to add another "log an activity" surface; only add analysis.

### Bottom line
MaxxIt's **tracking** layer is broad and mature across 8 of 9 domains; the consistent gap is the **rank/analyze** layer for already-tracked domains (Skills, Experiences, Career, Productivity) and a genuinely thin **Relationships** domain. Expansion should be **promotion of existing data into the tier/score/insight spine** — almost never new trackers. No code was written this phase; this is product discovery only.
