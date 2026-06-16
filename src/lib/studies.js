// ============================================================================
// Studier (Studies) composite engine — Phase 14.
// ----------------------------------------------------------------------------
// Phase 13 found that Skills (skill_logs + getSkillTier / "fardigheter") were
// already tracked and already had tier logic, but were NEVER surfaced as a
// category and were EXCLUDED from the Maxx Score. Phase 14 folds Skills into the
// existing "Plugg" study category — renamed user-facing to **Studier** — as a
// SUB-DIMENSION, not a new top-level category.
//
//   ⚠️ No new tracker, no new table, no 7th Maxx category. This is a pure blend
//   of two tiers the system ALREADY computes:
//     · formal study tier  → calculateStudyTier(mastery)   (courses/exams/mastery)
//     · skills tier         → getSkillTier(min/week) via skTop (languages, etc.)
//   The composite REPLACES the plugg tier in-place (internal id stays 'plugg'),
//   so Maxx Score / Rank Up / Bottleneck consume it with zero parallel logic.
// ============================================================================
import { TIER_NAMES, TIER_COLORS } from '../components/dashboard/tierUtils'

const round = (x) => Math.round(x * 10) / 10
const clampTier = (t) => Math.max(1, Math.min(8, Math.round(t)))

// Life stage / focus → "is this person primarily a student or a professional?"
// Mirrors tierProfiles.suggestTierProfile so the persona stays consistent.
const STUDENT_FOCI = ['education', 'studies']
const PRO_STAGES = ['professional', 'entrepreneur', 'early_career']
const PRO_FOCI = ['career', 'wealth']

/**
 * Profile-aware weighting between formal studies and skills.
 *   student      → formal 70 / skills 30
 *   professional → formal 30 / skills 70
 *   balanced     → 50 / 50
 *   only one source present → that source 100
 * @returns { formal, skills, mode }  (percentages summing to 100, or 0/0 mode:'none')
 */
export function studiesWeights({ lifeStage = null, primaryFocus = null, hasFormal = true, hasSkills = true } = {}) {
  if (!hasFormal && !hasSkills) return { formal: 0, skills: 0, mode: 'none' }
  if (!hasFormal) return { formal: 0, skills: 100, mode: 'skills-only' }
  if (!hasSkills) return { formal: 100, skills: 0, mode: 'formal-only' }
  const isStudent = lifeStage === 'student' || STUDENT_FOCI.includes(primaryFocus)
  const isPro = PRO_STAGES.includes(lifeStage) || PRO_FOCI.includes(primaryFocus)
  if (isStudent) return { formal: 70, skills: 30, mode: 'student' }
  if (isPro) return { formal: 30, skills: 70, mode: 'professional' }
  return { formal: 50, skills: 50, mode: 'balanced' }
}

/**
 * Compute the composite Studier tier from the two already-computed tiers.
 * @param formalTier  calculateStudyTier(mastery).tier (1–5) or null/0 when no mastery
 * @param skillTier   skTop.tier (best skill, 1–6); 0 = inactive (treated as no skills)
 * @returns null when neither source has data, else
 *   { tier, label, color, weights, parts:{formal,skills}, mode, blended, summary }
 */
export function computeStudiesTier({ formalTier = null, skillTier = null, lifeStage = null, primaryFocus = null } = {}) {
  const hasFormal = formalTier != null && formalTier >= 1
  const hasSkills = skillTier != null && skillTier >= 1 // skill tier 0 = "Inaktiv"
  if (!hasFormal && !hasSkills) return null

  const weights = studiesWeights({ lifeStage, primaryFocus, hasFormal, hasSkills })
  const f = hasFormal ? formalTier : 0
  const s = hasSkills ? skillTier : 0
  const blended = (weights.formal * f + weights.skills * s) / 100
  const tier = clampTier(blended)

  return {
    tier,
    label: TIER_NAMES[tier] || `T${tier}`,
    color: TIER_COLORS[tier] || '#6b7280',
    weights,
    parts: {
      formal: { tier: hasFormal ? formalTier : null, weight: weights.formal, contribution: round((weights.formal * f) / 100) },
      skills: { tier: hasSkills ? skillTier : null, weight: weights.skills, contribution: round((weights.skills * s) / 100) },
    },
    mode: weights.mode,
    blended: round(blended),
    hasFormal,
    hasSkills,
    summary: studiesSummary(weights, hasFormal ? formalTier : null, hasSkills ? skillTier : null),
  }
}

// Human-readable composition line for the explainability surface (Swedish).
function studiesSummary(w, formalTier, skillTier) {
  if (w.mode === 'formal-only') return `Endast formella studier (T${formalTier}) — inga aktiva färdigheter loggade.`
  if (w.mode === 'skills-only') return `Endast färdigheter (T${skillTier}) — inga aktiva kurser.`
  return `Formella studier T${formalTier} (${w.formal}%) + färdigheter T${skillTier} (${w.skills}%).`
}

/**
 * Merge the existing formal-study levelUp and skills levelUp into ONE composite
 * levelUp so the existing Rank Up + Bottleneck engines generate actions from BOTH
 * sources with no parallel logic. Requirements are reused verbatim (each already
 * carries current/target/gapLabel/progress from Dashboard.makeReq); we only relabel
 * the headline and re-pick the binding bottleneck across the merged set.
 *
 * @param compositeTier  the computeStudiesTier().tier
 * @param formalLevelUp  Dashboard studyLevelUp (or null)
 * @param skillLevelUp   Dashboard skillLevelUp (or null)
 */
export function buildStudiesLevelUp(compositeTier, formalLevelUp, skillLevelUp) {
  const tier = compositeTier || 1
  const nextTier = Math.min(tier + 1, 8)
  const tag = (reqs, source) => (reqs || []).map((r) => ({ ...r, source }))
  const requirements = [
    ...tag(formalLevelUp?.requirements, 'formal'),
    ...tag(skillLevelUp?.requirements, 'skills'),
  ]
  if (!requirements.length) return null
  const blockers = requirements.filter((r) => !r.met)
  const primary = blockers.find((r) => r.missing) || [...blockers].sort((a, b) => (a.progress ?? 0) - (b.progress ?? 0))[0] || null
  const progressPct = Math.max(0, Math.min(100, Math.round(requirements.reduce((min, r) => Math.min(min, r.progress ?? 0), 100))))
  return {
    currentTier: tier,
    nextTier,
    maxTier: 8,
    title: tier >= 8 ? 'Maxxad nivå' : `T${tier} → T${nextTier}`,
    progressPct: tier >= 8 ? 100 : progressPct,
    primaryBottleneck: primary ? `${primary.label}${primary.gapLabel && primary.gapLabel !== 'Klar' ? ': ' + primary.gapLabel : ''}` : 'Inget blockerar nästa nivå',
    requirements,
    blockers,
  }
}
