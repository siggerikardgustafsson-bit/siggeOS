// Verifies the multi-role "Livssituation" (life_roles) actually drives the
// profile-aware tier divisions, while the legacy single `life_stage` still wins
// (so existing users' scores never move).
// Bundle needs env defines (personalization imports supabase):
//   esbuild scripts/life_roles_tiers_check.mjs --bundle --platform=node --format=esm \
//     --define:import.meta.env='{"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"test","DEV":false}' \
//     --outfile=/tmp/lr.mjs && node /tmp/lr.mjs
import { buildUserContext, deriveLifeStagesFromRoles } from '../src/lib/personalization.js'
import { calculateEconomyTier } from '../src/lib/tierEngine.js'
import { suggestTierProfile } from '../src/lib/tierProfiles.js'
import { isCategoryFallback, calculateTierConfidence, hasActiveEconomicRole } from '../src/lib/profileCompleteness.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

// ── role → life-stage derivation ──
ok('study role → student', JSON.stringify(deriveLifeStagesFromRoles([{ type: 'study', active: true }])) === '["student"]')
ok('business role → entrepreneur', JSON.stringify(deriveLifeStagesFromRoles([{ type: 'business', active: true }])) === '["entrepreneur"]')
ok('inactive role excluded', deriveLifeStagesFromRoles([{ type: 'job', active: false }]).length === 0)
ok('other role carries no economic signal', deriveLifeStagesFromRoles([{ type: 'other', active: true }]).length === 0)
ok('multi-role priority-ordered (entrepreneur before student)',
  JSON.stringify(deriveLifeStagesFromRoles([{ type: 'study', active: true }, { type: 'business', active: true }])) === '["entrepreneur","student"]')

// ── buildUserContext: explicit life_stage WINS (back-compat) ──
const ctxLegacy = buildUserContext({ life_stage: 'student', life_roles: [{ type: 'business', active: true }] })
ok('explicit life_stage overrides roles', ctxLegacy.lifeStage === 'student' && JSON.stringify(ctxLegacy.lifeStages) === '["student"]')

// ── buildUserContext: roles drive it when life_stage empty ──
const ctxRoles = buildUserContext({ life_roles: [{ type: 'study', active: true }, { type: 'business', active: true }] })
ok('roles populate lifeStages when no life_stage', JSON.stringify(ctxRoles.lifeStages) === '["entrepreneur","student"]')
ok('singular lifeStage = priority pick', ctxRoles.lifeStage === 'entrepreneur')

// ── economy tier: NO regression for legacy single-stage ──
const legacyEcon = calculateEconomyTier('income', 30000, { lifeStage: 'student', age: 22 })
const legacyEcon2 = calculateEconomyTier('income', 30000, buildUserContext({ life_stage: 'student', birth_date: '2003-01-01' }))
ok('legacy income tier still computed (not fallback)', legacyEcon.fallback === false)
ok('legacy ctx path matches raw lifeStage path (same factor)',
  legacyEcon.factors.lifeStage === legacyEcon2.factors.lifeStage,
  `${legacyEcon.factors.lifeStage} vs ${legacyEcon2.factors.lifeStage}`)

// ── economy tier: roles now BLEND (student 0.35 + entrepreneur 1.0 → 0.675) ──
const blended = calculateEconomyTier('income', 30000, ctxRoles)
ok('blended income factor = mean of role stages', Math.abs(blended.factors.lifeStage - 0.675) < 1e-9, `${blended.factors.lifeStage}`)
ok('blended economy tier is not fallback', blended.fallback === false)
const pureStudent = calculateEconomyTier('income', 30000, { lifeStages: ['student'] })
const pureEntre = calculateEconomyTier('income', 30000, { lifeStages: ['entrepreneur'] })
ok('blend sits between the two pure roles', blended.factors.lifeStage > pureStudent.factors.lifeStage && blended.factors.lifeStage < pureEntre.factors.lifeStage)

// ── empty profile → still fallback (unchanged) ──
const empty = calculateEconomyTier('income', 30000, { age: null, currency: 'SEK' })
ok('no stage + no age + SEK → fallback', empty.fallback === true)

// ── tier-profile weighting now role-aware via derived lifeStage ──
ok('roles steer tier profile (business → entrepreneur weighting)', suggestTierProfile(ctxRoles) === 'entrepreneur')
const ctxStudentOnly = buildUserContext({ life_roles: [{ type: 'study', active: true }] })
ok('study-only role → student weighting', suggestTierProfile(ctxStudentOnly) === 'student')

// ── confidence/fallback labels recognise role-based personalization ──
const econRoleProfile = { life_roles: [{ type: 'business', active: true }] }
ok('hasActiveEconomicRole true for active business role', hasActiveEconomicRole(econRoleProfile) === true)
ok('economy NOT labeled fallback when only a role is set', isCategoryFallback('economy', econRoleProfile) === false)
ok('economy confidence rises above base with a role', calculateTierConfidence('economy', econRoleProfile) > 55)
ok('economy still fallback with no stage and no role', isCategoryFallback('economy', {}) === true)
ok('inactive-only role does not count', hasActiveEconomicRole({ life_roles: [{ type: 'job', active: false }] }) === false)
ok('non-economic (other) role does not count', hasActiveEconomicRole({ life_roles: [{ type: 'other', active: true }] }) === false)

console.log(`\n  life_roles → tiers: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
