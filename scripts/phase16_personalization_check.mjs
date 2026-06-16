// Phase 16 verification — multi-user personalization.
// Proves the identity context is profile-driven (no hardcoded Sigge/medicine)
// and that 3 distinct personas yield 3 distinct AI-prompt blocks.
//
// This module imports personalization.js, which imports the supabase client
// (reads import.meta.env), so the bundle needs env defines:
//   esbuild scripts/phase16_personalization_check.mjs --bundle --platform=node \
//     --format=esm \
//     --define:import.meta.env='{"VITE_SUPABASE_URL":"http://localhost","VITE_SUPABASE_ANON_KEY":"test","DEV":false}' \
//     --outfile=/tmp/p16.mjs && node /tmp/p16.mjs
import {
  buildIdentityContext, identityToPrompt, identityToPromptLines,
  DEFAULT_DISPLAY_NAME, normalizeLifeRoles,
} from '../src/lib/personalization.js'

let pass = 0, fail = 0
const ok = (n, c, x = '') => { (c ? pass++ : fail++); console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`) }

// ── three personas (Part 10: A medical student, B engineer, C entrepreneur) ──
const A = {
  profile: {
    display_name: 'Maria', birth_date: '2002-03-01', country: 'Sverige',
    occupation: 'Student', life_stage: 'student',
    study_program: 'Läkarprogrammet', study_institution: 'Karolinska',
    primary_focus: 'education',
  },
  settings: { goals: { one_year: 'Klara termin 3', monthly_income_goal: 0 }, about_me: 'Pluggar medicin.' },
}
const B = {
  profile: {
    display_name: 'Johan', birth_date: '1994-07-12', country: 'Sverige',
    occupation: 'Software Engineer', life_stage: 'professional',
    primary_focus: 'career',
  },
  settings: { goals: { one_year: 'Bli senior', monthly_income_goal: 70000 }, about_me: 'Bygger SaaS-produkter.' },
}
const C = {
  profile: {
    display_name: 'Sara', birth_date: '1990-01-20', country: 'Sverige',
    occupation: 'Grundare', life_stage: 'entrepreneur',
    life_roles: [{ type: 'business', label: 'Eget bolag', description: 'E-handel', active: true }],
    primary_focus: 'wealth',
  },
  settings: { goals: { three_year: 'Exit', monthly_income_goal: 200000 } },
}

const ia = buildIdentityContext(A.profile, A.settings)
const ib = buildIdentityContext(B.profile, B.settings)
const ic = buildIdentityContext(C.profile, C.settings)

ok('A name resolves', ia.displayName === 'Maria')
ok('B name resolves', ib.displayName === 'Johan')
ok('C name resolves', ic.displayName === 'Sara')

const pa = identityToPrompt(ia), pb = identityToPrompt(ib), pc = identityToPrompt(ic)
ok('prompts are non-empty', pa.length > 0 && pb.length > 0 && pc.length > 0)
ok('prompts are all distinct', pa !== pb && pb !== pc && pa !== pc)
ok('A prompt is medicine-aware (from data, not hardcode)', pa.includes('Läkarprogrammet'))
ok('B prompt is engineer-aware', pb.includes('Software Engineer'))
ok('C prompt surfaces active business role', pc.includes('Eget bolag'))
ok('no persona leaks "Sigge"', !(pa + pb + pc).includes('Sigge'))
ok('no persona leaks medicine assumption when not in data', !pb.toLowerCase().includes('medicin') && !pc.toLowerCase().includes('medicin'))

// ── graceful fallbacks (brand-new user, no profile at all) ──
const empty = buildIdentityContext(null, null)
ok('empty identity has null name', empty.displayName === null)
ok('empty prompt falls back to neutral noun', identityToPrompt(empty).includes(DEFAULT_DISPLAY_NAME))
ok('empty prompt never says Sigge', !identityToPrompt(empty).includes('Sigge'))
ok('default noun is neutral', DEFAULT_DISPLAY_NAME === 'användaren')

// ── partial profile only lists what exists (no "okänt" wall) ──
const partial = buildIdentityContext({ display_name: 'Kim' }, null)
const partialLines = identityToPromptLines(partial)
ok('partial profile yields few lines', partialLines.length <= 2, `${partialLines.length} lines`)
ok('partial profile keeps the name', partialLines[0] === 'Namn: Kim')

// ── settings.display_name wins over profile.display_name (onboarding source) ──
const both = buildIdentityContext({ display_name: 'ProfileName' }, { display_name: 'SettingsName' })
ok('settings display_name takes precedence', both.displayName === 'SettingsName')

// ── inactive roles excluded from the active set ──
const roles = normalizeLifeRoles([{ type: 'job', label: 'X', active: false }, { type: 'study', label: 'Y' }])
const ri = buildIdentityContext({ life_roles: roles }, null)
ok('inactive roles excluded from activeRoles', ri.activeRoles.length === 1 && ri.activeRoles[0].label === 'Y')

console.log(`\n  Phase 16: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
