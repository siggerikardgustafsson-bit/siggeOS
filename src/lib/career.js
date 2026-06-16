// ============================================================================
// Career Progression Architecture — Phase 15.
// ----------------------------------------------------------------------------
// Career is NOT a tracker. It is a PROGRESSION MODEL that answers:
//   · Where am I now?  · Where am I trying to go?  · What is missing?
//   · What is my current trajectory?
//
//   ⚠️ No new tracker, no new table, no new project/income/task/education system.
//   This layer is a PURE READER that DERIVES a career view from data MaxxIt
//   already owns (Phase 13 audit): profile (life_stage/occupation/goals),
//   the Phase-14 Studier composite (education+skills), projects/project_tasks,
//   income_logs/pa_shifts, and skills. Architecture first — it is NOT wired into
//   the Maxx Score and produces NO AI advice (see §recommendation in the report).
//
// Consumes the same evidence-grading the rest of the product uses (reason.js),
// so career explainability speaks the same confidence language as Jarvis/Phase-12.
// ============================================================================
import { evidenceLevel, EVIDENCE } from './jarvis/reason'

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
const round = (x) => Math.round(x * 10) / 10
const pct = (x) => clamp(Math.round(x), 0, 100)

// ── Career positions (life-stage ladder) ───────────────────────────────────
// Maps the profile.life_stage enum to an ordinal progression. parent/retired are
// off the linear ladder (ordinal null) — career readiness still computes from
// drivers, but stage-advancement isn't implied.
export const CAREER_POSITIONS = {
  student:       { id: 'student',       label: 'Student',        ordinal: 1, next: 'early_career' },
  early_career:  { id: 'early_career',  label: 'Tidig karriär',  ordinal: 2, next: 'professional' },
  professional:  { id: 'professional',  label: 'Yrkesverksam',   ordinal: 3, next: 'senior' },
  entrepreneur:  { id: 'entrepreneur',  label: 'Entreprenör',    ordinal: 3, next: 'established' },
  parent:        { id: 'parent',        label: 'Förälder',       ordinal: null, next: null },
  retired:       { id: 'retired',       label: 'Pensionär',      ordinal: null, next: null },
}

// ── Career registry (task 8) — tracks, NOT hardcoded to medicine ────────────
// Each track defines the driver emphasis (weights summing to 1) and example role
// ladders. Roles are EXAMPLES for framing; a user's actual role/target is free
// text (profile.occupation / goals). credentials lists the kind of formal proof
// that track values (surfaced as a readiness gap when education is high but no
// credential is logged — architecture only; credential tracking is future work).
export const CAREER_REGISTRY = {
  healthcare: {
    id: 'healthcare', label: 'Vård & medicin',
    driverWeights: { education: 0.35, skills: 0.15, experience: 0.25, projects: 0.10, incomeGrowth: 0.15 },
    roleLadder: ['Student', 'AT/Underläkare', 'Legitimerad', 'Specialist', 'Överläkare'],
    credentials: ['legitimation', 'specialistbevis'],
  },
  engineering: {
    id: 'engineering', label: 'Teknik & ingenjör',
    driverWeights: { education: 0.25, skills: 0.30, projects: 0.20, experience: 0.15, incomeGrowth: 0.10 },
    roleLadder: ['Student', 'Junior', 'Ingenjör', 'Senior', 'Lead/Arkitekt'],
    credentials: ['examen', 'certifiering'],
  },
  business: {
    id: 'business', label: 'Affär & ledning',
    driverWeights: { projects: 0.25, incomeGrowth: 0.25, skills: 0.20, experience: 0.20, education: 0.10 },
    roleLadder: ['Assistent', 'Specialist', 'Manager', 'Director', 'Executive'],
    credentials: ['examen'],
  },
  entrepreneurship: {
    id: 'entrepreneurship', label: 'Entreprenörskap',
    driverWeights: { projects: 0.30, incomeGrowth: 0.30, skills: 0.20, experience: 0.15, education: 0.05 },
    roleLadder: ['Idéstadie', 'Grundare', 'Etablerad', 'Skalande', 'Exit/Portfölj'],
    credentials: [],
  },
  trades: {
    id: 'trades', label: 'Hantverk & yrke',
    driverWeights: { skills: 0.35, experience: 0.30, projects: 0.15, education: 0.10, incomeGrowth: 0.10 },
    roleLadder: ['Lärling', 'Gesäll', 'Yrkesarbetare', 'Mästare', 'Egen firma'],
    credentials: ['yrkesbevis', 'mästarbrev'],
  },
  academic: {
    id: 'academic', label: 'Akademi & forskning',
    driverWeights: { education: 0.40, projects: 0.25, skills: 0.15, experience: 0.15, incomeGrowth: 0.05 },
    roleLadder: ['Student', 'Doktorand', 'Postdoc', 'Lektor', 'Professor'],
    credentials: ['examen', 'doktorsexamen'],
  },
  generic: {
    id: 'generic', label: 'Allmän karriär',
    driverWeights: { education: 0.25, skills: 0.20, projects: 0.20, experience: 0.20, incomeGrowth: 0.15 },
    roleLadder: ['Nybörjare', 'Junior', 'Etablerad', 'Senior', 'Ledande'],
    credentials: [],
  },
}
export const DEFAULT_TRACK = 'generic'

// Infer the career track from profile signals (occupation/study text + focus).
// Keyword-based and conservative; falls back to 'generic'. No medicine bias.
const TRACK_KEYWORDS = {
  healthcare: ['läkar', 'medicin', 'sjukvård', 'vård', 'sjukskötersk', 'physician', 'medical', 'nurse', 'ki', 'karolinska'],
  engineering: ['ingenjör', 'engineer', 'developer', 'utvecklar', 'software', 'tech', 'data', 'civilingenjör'],
  business: ['ekonom', 'business', 'manager', 'konsult', 'consult', 'sälj', 'marknad', 'finans', 'mba'],
  entrepreneur: ['founder', 'grundare', 'entrepren', 'startup', 'egen firma', 'vd', 'ceo'],
  trades: ['snickare', 'elektriker', 'mekaniker', 'hantverk', 'bygg', 'montör', 'tekniker'],
  academic: ['forskar', 'doktorand', 'phd', 'akademi', 'universitet', 'professor', 'research'],
}
export function inferCareerTrack(profile = {}) {
  const hay = `${profile.occupation || ''} ${profile.study_program || ''} ${profile.study_institution || ''}`.toLowerCase()
  for (const [track, kws] of Object.entries(TRACK_KEYWORDS)) {
    if (kws.some((k) => hay.includes(k))) return track === 'entrepreneur' ? 'entrepreneurship' : track
  }
  if (profile.life_stage === 'entrepreneur') return 'entrepreneurship'
  return DEFAULT_TRACK
}

export function getCareerTrack(id) {
  return CAREER_REGISTRY[id] || CAREER_REGISTRY[DEFAULT_TRACK]
}

// ── Career drivers (task 3) — measurable, from existing data only ───────────
/**
 * @param studies   Phase-14 composite { tier (1–8), parts:{formal,skills} } or null
 * @param skillTier best skill tier (skTop.tier 0–6) or null
 * @param projects  { total, completedTasks, totalTasks } counts (from projects/project_tasks)
 * @param income    { currentMonthly, goalMonthly, trendPct } (income_logs/pa_shifts/goals)
 * @param experience{ months } tenure proxy (optional) + position ordinal supplied by caller
 * @returns array of driver objects { id, label, score(0–100), value, hasData, confidence, source }
 */
export function buildCareerDrivers({ studies = null, skillTier = null, projects = null, income = null, experience = null, positionOrdinal = null } = {}) {
  const eduTier = studies?.tier ?? null
  const education = mkDriver('education', 'Utbildning', eduTier != null,
    eduTier != null ? pct((eduTier / 8) * 100) : 0, eduTier != null ? `Studier T${eduTier}` : null, 'Studier-komposit (formell + färdigheter)')

  const skills = mkDriver('skills', 'Färdigheter', skillTier != null && skillTier > 0,
    skillTier ? pct((skillTier / 6) * 100) : 0, skillTier ? `Färdighet T${skillTier}` : null, 'skill_logs / getSkillTier')

  const projTotal = projects?.total ?? 0
  const projDone = projects?.completedTasks ?? 0
  const projects_ = mkDriver('projects', 'Projekt', projTotal > 0 || projDone > 0,
    pct(projTotal * 15 + projDone * 3), projTotal ? `${projTotal} projekt, ${projDone} klara uppgifter` : null, 'projects / project_tasks')

  const tenure = experience?.months ?? null
  const expHasData = positionOrdinal != null
  const expScore = expHasData ? pct((positionOrdinal / 4) * 60 + (tenure != null ? clamp(tenure / 60, 0, 1) * 40 : 0)) : 0
  const experience_ = mkDriver('experience', 'Erfarenhet', expHasData,
    expScore, expHasData ? `Position ${positionOrdinal}/4${tenure != null ? `, ${Math.round(tenure)} mån` : ''}` : null,
    'life_stage ordinal + tenure (proxy)', tenure != null ? null : 'partial')

  const cur = income?.currentMonthly ?? null
  const goal = income?.goalMonthly ?? null
  const incomeHasData = cur != null
  const incomeScore = incomeHasData
    ? (goal ? pct((cur / goal) * 100) : pct(clamp((income?.trendPct ?? 0) + 50, 0, 100)))
    : 0
  const incomeGrowth = mkDriver('incomeGrowth', 'Inkomstutveckling', incomeHasData,
    incomeScore, incomeHasData ? `${Math.round(cur).toLocaleString('sv-SE')} kr/mån${goal ? ` (mål ${Math.round(goal).toLocaleString('sv-SE')})` : ''}` : null,
    'income_logs / pa_shifts / goals', goal ? null : 'partial')

  return [education, skills, projects_, experience_, incomeGrowth]
}

function mkDriver(id, label, hasData, score, value, source, confidenceFlag = null) {
  // Driver confidence: full data → fact-ish; partial (proxy/no goal) → weak; none → weak.
  const confidence = !hasData ? EVIDENCE.weak.id : confidenceFlag === 'partial' ? EVIDENCE.weak.id : EVIDENCE.strong.id
  return { id, label, score: hasData ? score : 0, value, hasData, source, confidence }
}

// ── Career outcomes (task 4) — outcomes, not inputs ─────────────────────────
export function buildCareerOutcomes({ profile = {}, projects = null, income = null } = {}) {
  const posKey = profile.life_stage || null
  const position = posKey && CAREER_POSITIONS[posKey] ? CAREER_POSITIONS[posKey] : null
  return {
    roleProgression: {
      position: position?.id ?? null,
      label: position?.label ?? null,
      ordinal: position?.ordinal ?? null,
      nextPosition: position?.next ?? null,
      currentRole: profile.occupation ?? null,
    },
    incomeProgression: income?.currentMonthly != null ? {
      currentMonthly: income.currentMonthly,
      goalMonthly: income.goalMonthly ?? null,
      pctOfGoal: income.goalMonthly ? pct((income.currentMonthly / income.goalMonthly) * 100) : null,
      trendPct: income.trendPct ?? null,
    } : null,
    responsibilityProgression: { projectsLed: projects?.total ?? 0, tasksCompleted: projects?.completedTasks ?? 0 },
    projectProgression: { total: projects?.total ?? 0, completedTasks: projects?.completedTasks ?? 0, totalTasks: projects?.totalTasks ?? 0 },
  }
}

// ── Career readiness model (task 5) — what is holding the user back? ────────
const GAP_THRESHOLD = 50   // a driver below this is "weak"
const GAP_MIN_WEIGHT = 0.12 // only weights that matter to this track count as blockers
const GAP_LABELS = {
  education: 'Behöver högre utbildningsnivå',
  skills: 'Behöver fler/djupare färdigheter',
  projects: 'Behöver fler avslutade projekt',
  experience: 'Behöver mer erfarenhet',
  incomeGrowth: 'Inkomsten ligger under målet',
}

/**
 * Weighted readiness over present drivers (renormalized so missing data doesn't
 * silently deflate the score), plus blockers / strongest / gaps. Deterministic;
 * no AI. `targetReadiness` is the readiness toward the next stage of the track.
 */
export function assessCareerReadiness(drivers, trackId) {
  const track = getCareerTrack(trackId)
  const w = track.driverWeights
  const present = drivers.filter((d) => d.hasData)
  const totalW = present.reduce((s, d) => s + (w[d.id] || 0), 0)
  const score = totalW > 0
    ? pct(present.reduce((s, d) => s + d.score * (w[d.id] || 0), 0) / totalW)
    : 0

  const weighted = drivers.map((d) => ({ ...d, weight: w[d.id] || 0, impact: round((100 - d.score) * (w[d.id] || 0)) }))
  const blockers = weighted
    .filter((d) => d.weight >= GAP_MIN_WEIGHT && (!d.hasData || d.score < GAP_THRESHOLD))
    .sort((a, b) => b.weight - a.weight || b.impact - a.impact)
    .map((d) => ({ driver: d.id, label: d.hasData ? GAP_LABELS[d.id] : `Saknar data: ${d.label.toLowerCase()}`, score: d.score, weight: d.weight, hasData: d.hasData }))
  const strongestDrivers = [...present]
    .map((d) => ({ ...d, contribution: round(d.score * (w[d.id] || 0)) }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
  const biggestGaps = [...weighted]
    .filter((d) => d.weight > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 2)

  return { score, completeness: pct((present.length / drivers.length) * 100), blockers, strongestDrivers, biggestGaps, track: track.id }
}

// ── Career framework / top-level composite ──────────────────────────────────
/**
 * Build the whole career view from already-fetched MaxxIt data. This is the
 * single entry point a future Dashboard/Jarvis surface would consume — analogous
 * to buildRankUpLayer / buildMaxxProfile, but DERIVED and NOT part of the score.
 */
export function buildCareerProfile({ profile = {}, goals = {}, studies = null, skillTier = null, projects = null, income = null, experience = null } = {}) {
  const trackId = inferCareerTrack(profile)
  const position = profile.life_stage && CAREER_POSITIONS[profile.life_stage] ? CAREER_POSITIONS[profile.life_stage] : null
  const positionOrdinal = position?.ordinal ?? null

  const drivers = buildCareerDrivers({ studies, skillTier, projects, income, experience, positionOrdinal })
  const outcomes = buildCareerOutcomes({ profile, projects, income })
  const readiness = assessCareerReadiness(drivers, trackId)

  const targetRole = goals?.future_plan || goals?.one_year || null

  return {
    track: trackId,
    trackLabel: getCareerTrack(trackId).label,
    framework: {
      currentPosition: position?.id ?? profile.life_stage ?? null,
      currentPositionLabel: position?.label ?? null,
      currentRole: profile.occupation ?? null,
      targetRole,
      nextPosition: position?.next ?? null,
      roleLadder: getCareerTrack(trackId).roleLadder,
    },
    drivers,
    outcomes,
    readiness,
    meta: { source: 'derived', partOfMaxxScore: false, generatedFor: 'career-layer' },
  }
}

// ── Career explainability (task 6) — reuses the evidence-grading pattern ─────
export function explainCareerStage(careerProfile) {
  if (!careerProfile) return null
  const { framework, readiness } = careerProfile
  const top = readiness.strongestDrivers[0]
  const level = evidenceLevel({ profileConfidence: readiness.completeness })
  const stage = framework.currentPositionLabel || 'okänd'
  const role = framework.currentRole ? ` som ${framework.currentRole}` : ''
  const driverText = top ? ` Din starkaste drivkraft är ${top.label.toLowerCase()} (${top.score}/100).` : ''
  return {
    question: 'Varför är jag i detta karriärsteg?',
    answer: `Du är i steget "${stage}"${role} på spåret ${careerProfile.trackLabel.toLowerCase()}. Karriärberedskap mot nästa steg: ${readiness.score}/100.${driverText}`,
    evidence: level.id, evidenceLabel: level.label,
    data: { stage: framework.currentPosition, readiness: readiness.score, track: careerProfile.track, completeness: readiness.completeness },
  }
}

export function careerDriverBreakdown(careerProfile) {
  if (!careerProfile) return null
  return {
    strongest: careerProfile.readiness.strongestDrivers.map((d) => ({ id: d.id, label: d.label, score: d.score, contribution: d.contribution })),
    biggestGaps: careerProfile.readiness.biggestGaps.map((d) => ({ id: d.id, label: GAP_LABELS[d.id] || d.label, score: d.score, weight: d.weight })),
    blockers: careerProfile.readiness.blockers,
  }
}
