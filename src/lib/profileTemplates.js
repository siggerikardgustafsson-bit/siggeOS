// ============================================================================
// Profile / onboarding templates (Phase 5 — DATA ONLY, no UI flow, nothing
// applied automatically). These are inert starter definitions that a FUTURE
// onboarding flow and the future module-visibility / custom-module systems can
// read. Defining them now keeps the shape stable without building those systems.
//
// `suggestedModules` references future module keys — they do nothing yet.
// ============================================================================

// Per-life-stage suggested defaults.
export const LIFE_STAGE_TEMPLATES = {
  student: {
    label: 'Student',
    blurb: 'Studier i fokus, bygg vanor och ekonomi tidigt.',
    suggestedFocus: { primary: 'education', secondary: 'fitness' },
    suggestedModules: ['plugg', 'traning', 'halsa', 'ekonomi', 'kalender'],
    defaults: { unit_system: 'metric' },
  },
  early_career: {
    label: 'Tidig karriär',
    blurb: 'Etablera karriär, hälsa och sparande.',
    suggestedFocus: { primary: 'career', secondary: 'wealth' },
    suggestedModules: ['jobb', 'ekonomi', 'traning', 'halsa'],
    defaults: { unit_system: 'metric' },
  },
  professional: {
    label: 'Yrkesverksam',
    blurb: 'Balansera prestation, hälsa och förmögenhet.',
    suggestedFocus: { primary: 'wealth', secondary: 'health' },
    suggestedModules: ['ekonomi', 'jobb', 'traning', 'halsa', 'upplevelser'],
    defaults: { unit_system: 'metric' },
  },
  entrepreneur: {
    label: 'Entreprenör',
    blurb: 'Driv projekt, kassaflöde och energi.',
    suggestedFocus: { primary: 'career', secondary: 'wealth' },
    suggestedModules: ['jobb', 'ekonomi', 'halsa', 'productivity'],
    defaults: { unit_system: 'metric' },
  },
  parent: {
    label: 'Förälder',
    blurb: 'Tid, hälsa och relationer i balans.',
    suggestedFocus: { primary: 'relationships', secondary: 'health' },
    suggestedModules: ['halsa', 'ekonomi', 'kalender', 'upplevelser'],
    defaults: { unit_system: 'metric' },
  },
  retired: {
    label: 'Pensionär',
    blurb: 'Hälsa, upplevelser och välmående.',
    suggestedFocus: { primary: 'health', secondary: 'experiences' },
    suggestedModules: ['halsa', 'upplevelser', 'ekonomi'],
    defaults: { unit_system: 'metric' },
  },
}

// Per-focus-area suggested goals/metrics (free-form, future onboarding fills them).
export const GOAL_TEMPLATES = {
  fitness:       { label: 'Träning',     prompts: ['Veckomål för pass', 'Styrke- eller löpmål', 'Målvikt'] },
  career:        { label: 'Karriär',     prompts: ['Roll/titel om 1 år', 'Kompetens att utveckla', 'Inkomstmål'] },
  education:     { label: 'Utbildning',  prompts: ['Examen/kurs', 'Veckotimmar studier', 'Betygsmål'] },
  wealth:        { label: 'Ekonomi',     prompts: ['Sparandemål', 'Månadsbudget', 'Nettoförmögenhetsmål'] },
  experiences:   { label: 'Upplevelser', prompts: ['Resor i år', 'Bucket-list', 'Äventyr/månad'] },
  relationships: { label: 'Relationer',  prompts: ['Tid med nära', 'Sociala mål', 'Återkommande ritualer'] },
  health:        { label: 'Hälsa',       prompts: ['Sömnmål', 'Stresshantering', 'Kost/vatten'] },
  productivity:  { label: 'Produktivitet', prompts: ['Fokustimmar/dag', 'Rutiner', 'Projekt att slutföra'] },
}

// Named starter bundles (life-stage + focus + suggested modules).
// These are the "templates" a future onboarding screen would offer.
export const ONBOARDING_TEMPLATES = [
  {
    id: 'student',
    label: 'Student',
    lifeStage: 'student',
    focus: { primary: 'education', secondary: 'fitness' },
    modules: ['plugg', 'traning', 'halsa', 'ekonomi', 'kalender'],
    blurb: 'Studieplan, vanor och ekonomi från dag ett.',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    lifeStage: null,
    focus: { primary: 'fitness', secondary: 'health' },
    modules: ['traning', 'halsa', 'upplevelser'],
    blurb: 'Träning och hälsa i centrum.',
  },
  {
    id: 'career',
    label: 'Career',
    lifeStage: 'professional',
    focus: { primary: 'career', secondary: 'wealth' },
    modules: ['jobb', 'ekonomi', 'kalender', 'halsa'],
    blurb: 'Karriär, ekonomi och tid under kontroll.',
  },
  {
    id: 'entrepreneur',
    label: 'Entrepreneur',
    lifeStage: 'entrepreneur',
    focus: { primary: 'career', secondary: 'wealth' },
    modules: ['jobb', 'ekonomi', 'halsa'],
    blurb: 'Projekt, kassaflöde och energi.',
  },
]

export const getOnboardingTemplate = (id) => ONBOARDING_TEMPLATES.find((t) => t.id === id) || null
