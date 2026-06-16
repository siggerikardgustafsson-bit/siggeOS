# Phase 16 — Multi-User Activation

> **Goal:** make MaxxIt genuinely usable by a brand-new user with no prior setup.
> **Scope discipline:** no social features, no leaderboards, no custom modules, no
> new scoring systems, no new dashboard systems, no redesign. This phase is
> **account creation + auth flow + onboarding + personalization cleanup** only —
> all changes are *substitutions and additions* on top of the existing
> profile/RLS architecture.

---

## 0. Summary

The backend was already multi-user-safe (RLS per the deploy report; `handle_new_user`
trigger auto-creates a profile on signup). The two real gaps were **(a) no signup /
password-reset UI** — the app could only *log in* — and **(b) hardcoded "Sigge"
biography in the 5 AI prompt sites**, so a second user got Sigge's identity,
side-quests and a medicine-tutor framing. Both are now closed.

A new person can register → (verify email) → sign in → get an auto-created profile →
land in onboarding → reach a Dashboard and AI surfaces that personalize to **them**.

**Verification:** all 10 changed files transform clean (esbuild); the 9 existing
logic suites still pass **505/505** (no scoring touched); a new
`phase16_personalization_check.mjs` proves 3 personas (medical student / software
engineer / entrepreneur) yield 3 distinct, leak-free AI prompts — **18/18 pass**.

---

## 1. Authentication Audit (before → after)

| Capability | Before | After |
|---|---|---|
| **Login** | ✅ `signInWithPassword` + Login page | ✅ unchanged |
| **Signup** | ⚠️ `signUp` existed in context but **no UI** — unreachable | ✅ full signup form (name + email + password), wired |
| **Sign out** | ✅ in Sidebar | ✅ unchanged |
| **Password reset** | ❌ none | ✅ "Glömt lösenord" → reset email → recovery form to set a new one |
| **Email verification** | ⚠️ handled by Supabase, but no UI feedback | ✅ "check your inbox" notice; signup detects no-session = confirmation pending |
| **Profile creation** | ✅ `handle_new_user` DB trigger | ✅ + signup now passes `display_name` into auth metadata so the trigger seeds a real name |
| **First-time detection** | ✅ `AppLayout` reads `user_settings.onboarding_done` | ✅ unchanged (works without a pre-existing settings row) |

No new auth tables or migrations were required.

---

## 2–4. Registration, profile creation, first-time detection

**Registration flow** (`src/pages/Login.jsx`, `src/context/AuthContext.jsx`):
a single page with four modes — `signin` / `signup` / `forgot` / `recovery`.
- `signUp(email, password, displayName)` forwards `display_name` into
  `options.data` and sets `emailRedirectTo: /login`.
- Errors are mapped to friendly Swedish copy (`friendlyError`): email already
  exists, weak password (< 6 chars), invalid email, unconfirmed email, rate limit
  — with a raw-message fallback so nothing is silently swallowed.
- If email confirmation is on, signUp returns `needsEmailConfirmation` (no session
  + a user) → the UI shows "Kolla din mail…" and flips to sign-in instead of
  assuming a live session.

**Automatic profile creation** (no client-side DB setup, no race):
the `handle_new_user` trigger (`…phase1_00_profiles_and_admin.sql`) fires
`after insert on auth.users` and inserts a `profiles` row (now seeded with the
signup `display_name`). `user_settings` + `onboarding_done` are created when
onboarding finishes. A brand-new user with **no** `user_settings` row is handled by
the gate's `maybeSingle()` → null → onboarding shows. No manual setup, no race.

**First-time vs returning** (`AppLayout.jsx`, unchanged): new user (no
`onboarding_done`) → onboarding modal; returning user → straight to Dashboard.

**Password recovery routing** (`App.jsx`): during recovery a session exists, so the
`/login` guard now keeps the user on `/login` while `recovery === true` (instead of
bouncing them to the Dashboard) so they can set a new password.

---

## 5. Onboarding validation (student / professional / entrepreneur)

Onboarding (`src/components/Onboarding.jsx`) was already generic — Welcome →
Profile → Personalize (life-stage/occupation/focus) → Goals → Jarvis → Done — with
every field optional except display name, and per-step skip. Phase-16 fixes:
- Name placeholder `"t.ex. Sigge Gustafsson"` → neutral `"t.ex. Alex Andersson"`
  (also in Settings).
- No medicine / Sweden / Sigge assumptions remain in the copy; `LIFE_STAGES`
  already covers student / professional / entrepreneur / parent / etc.

The optional multi-role "Livssituation" (Phase post-deploy `life_roles`) lets a
user describe any combination of study / job / business / parent / other.

---

## 6. Multi-User Personalization Cleanup (the core of this phase)

Hardcoded "Sigge" biography removed from **all five AI prompt sites**, replaced with
profile/goals-driven context and a neutral fallback (`användaren`):

| Site | File | Before | After |
|---|---|---|---|
| **Jarvis (brain)** | `supabase/functions/jarvis-chat/index.ts` | `"Sigges AI-coach"`, turn label "Sigge", "faktum om Sigge", link copy | `${userName}s …` from `user_settings.display_name` (added to both selects); turn label "Användare"; neutral memory/link copy; explicit "assume nothing not in PROFIL/MINNE/NU" |
| **Journal AI** | `src/pages/Journal.jsx` | `"Sigges personliga AI"`, `"Sigges kända beteendemönster"` | `"användarens …"` (analyzer reads the entry; no identity assertion) |
| **Insights weekly** | `src/pages/Insights.jsx` | `"Analysera Sigges senaste vecka"` | `"Analysera min senaste vecka"` + "areas you actually logged data in" |
| **Side Quests** | `src/pages/Upplevelser.jsx` | full Sigge bio (21, medicine, Täby, Håkan Hellström, Göteborg…) | built from `getUserIdentityContext()` → real goals/roles/studies/trips; generic-but-motivating fallback when sparse |
| **Study Tutor** | `src/components/StudyModal.jsx` | `"Sigges personliga medicinstudent-tutor"`, "Om Sigge svarar…" | `"användarens personliga studie-tutor${program ? ' inom '+program : ''}"` reading `profiles.study_program`; "assume no subject not in goals/material"; "användaren" |

Jarvis trip-budget prompt in Upplevelser also de-Sigged.
Sweep confirms the only remaining "Sigge" in these files is a single code comment.

---

## 7. Study Tutor personalization

`StudyModal` now loads `profiles.study_program` on mount and frames the tutor as
*"studie-tutor inom &lt;program&gt;"* (e.g. Läkarprogrammet / Civilingenjör /
Juristprogrammet / Ekonomi / Språk) — or just *"studie-tutor"* if unset. The exam
name, learning goals, and uploaded course material remain the substantive source of
truth, and the prompt now explicitly tells the model to **assume no subject area
not present in the goals/material**. Nothing medicine-specific remains.

## 8. Side Quest personalization

`generateSideQuests()` builds its prompt from `getUserIdentityContext()` (goals,
focus, life-stage, active roles, studies, about-me) plus the user's own completed
trips and prior quests. With a sparse profile it falls back to "keep quests broadly
motivating" rather than inventing a biography. No Sigge facts remain.

---

## 9. User Identity Context — `getUserIdentityContext()`

New single source of truth in `src/lib/personalization.js`:
- `buildIdentityContext(profile, settings)` — pure builder → `{ displayName,
  hasName, aboutMe, age, sex, country, city, occupation, lifeStage, lifeRoles,
  activeRoles, studies{program,institution}, goals{primaryFocus, oneYear,
  threeYear, monthlyIncome, …}, currency, completeness }`.
- `identityToPrompt(identity)` / `identityToPromptLines(identity)` — render a
  compact Swedish prompt block, **only** including lines that have data.
- `getUserIdentityContext(userId?)` — async accessor that fetches `profiles` +
  `user_settings` and never throws (returns a minimal identity on failure).
- `DEFAULT_DISPLAY_NAME = 'användaren'` — the neutral fallback used everywhere.

`settings.display_name` takes precedence over `profiles.display_name` (it's the
onboarding source). Side-quests consume it today; it is the reuse point for any
future prompt site.

---

## 10. New-user verification

Real prod auth users were **not** created from this environment (avoids polluting
the live DB and needs interactive email). Instead the personalization layer is
proven deterministically in `scripts/phase16_personalization_check.mjs` with three
personas — **A** medical student (Läkarprogrammet/Karolinska), **B** software
engineer, **C** entrepreneur:

- ✅ names resolve per-user; ✅ three prompts are **all distinct**;
- ✅ A's prompt is medicine-aware **from data** (not hardcode); B engineer-aware;
  C surfaces the active business role;
- ✅ **no** persona leaks "Sigge"; ✅ no medicine assumption leaks into B/C;
- ✅ empty profile → neutral `användaren`, never "Sigge"; partial profile lists
  only what exists; ✅ inactive roles excluded. **18/18 pass.**

Plus the existing **505/505** suites (tier/maxx/profile/benchmark/rankup/jarvis/
insight/studies/career) still green — scoring untouched.

**Live smoke-test (manual, requires a logged-out browser — recommended before beta):**
- [ ] Signup with a new email → "check inbox" (if confirmation on) or straight in
- [ ] Confirm email → sign in → onboarding shows → Dashboard loads
- [ ] "Glömt lösenord" → reset email → link → set new password → land on Dashboard
- [ ] As the new user: Jarvis greets by *their* name; side-quests fit *their* goals;
      study tutor matches *their* program; insights reflect *their* data
- [ ] Second-user data isolation (RLS) — unchanged from deploy report §6

---

## Files changed

**Auth flow**
- `src/context/AuthContext.jsx` — `signUp` (metadata + email-confirmation detection),
  `resetPassword`, `updatePassword`, `recovery`/`clearRecovery` state.
- `src/pages/Login.jsx` — rewritten: 4 modes (signin/signup/forgot/recovery) +
  friendly error mapping.
- `src/App.jsx` — `/login` guard keeps recovery sessions on the login page.

**Identity / personalization**
- `src/lib/personalization.js` — `getUserIdentityContext`, `buildIdentityContext`,
  `identityToPrompt(Lines)`, `DEFAULT_DISPLAY_NAME`.
- `supabase/functions/jarvis-chat/index.ts` — `display_name` in both
  `user_settings` selects; `userName` in the system prompt; neutral turn-label /
  memory / link copy. **(requires redeploy to take effect — see below)**
- `src/pages/Journal.jsx` — de-Sigged extraction prompt.
- `src/pages/Insights.jsx` — de-Sigged weekly-report prompt.
- `src/pages/Upplevelser.jsx` — profile-driven side-quests + de-Sigged budget prompt.
- `src/components/StudyModal.jsx` — `study_program`-aware tutor framing; "användaren".
- `src/components/Onboarding.jsx`, `src/pages/Settings.jsx` — neutral name placeholder.

**Verification**
- `scripts/phase16_personalization_check.mjs` — new (18 checks).

---

## Remaining blockers before public beta

1. **Redeploy `jarvis-chat`** so the de-Sigged prompt is live: the frontend change
   ships with Vercel, but the edge function only updates on
   `supabase functions deploy jarvis-chat`. Until then the *brain* still says
   "Sigge". **(one command; not run in this phase — deploy is owner-gated.)**
2. **Confirm Supabase email settings** for the prod project: enable the signup
   confirmation + password-reset email templates and add the prod redirect URL
   (`https://sigge-os.vercel.app/login`) to the allowed redirect list, or signup/
   reset links won't resolve.
3. **Non-prompt Sigge data still exists** (out of this phase's scope, from the
   audit): hardcoded income sources (`PA-jobb`/`Erik Norling`/`CSN`) and the
   `erik_*` client schema. These are *data/UI* personalization, not the AI-prompt
   layer Phase 16 targets — flagged for a later phase.
4. **Live signup/reset smoke test** (§10) on a logged-out browser before inviting a
   real user.

*Scope held: no social systems, no new scoring, no redesign. Every change is a
substitution or an additive helper on the existing profile/RLS foundation.*
