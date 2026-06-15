#!/usr/bin/env bash
# ============================================================================
# MASTER verification gate — run before inviting a second user.
#
#   bash supabase/verify_all.sh                      # automatable checks + manual checklist
#   USER_JWT=<logged-in access_token> bash supabase/verify_all.sh   # also exercises authed paths
#
# Runs what can be automated here (typecheck + edge auth/CORS) and prints the
# manual gate (SQL verifiers + second-user isolation) with expected results.
# SQL files are run in the Supabase SQL editor — they need DB access this script
# does not assume.
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
USER_JWT="${USER_JWT:-}"
pass=0; warn=0

hr() { printf '\n────────────────────────────────────────────────────────\n%s\n' "$1"; }

hr "0 · Prerequisites"
[ -f .env ] && echo "  ✓ .env present" || { echo "  ✗ .env missing"; warn=1; }
command -v supabase >/dev/null && echo "  ✓ supabase CLI $(supabase --version 2>/dev/null | head -1)" || { echo "  ✗ supabase CLI missing"; warn=1; }
command -v deno >/dev/null && echo "  ✓ deno present" || echo "  ⚠ deno NOT installed (typecheck will be skipped)"

hr "1 · Edge-function typecheck (deno check)"
if command -v deno >/dev/null; then
  bash supabase/functions/typecheck.sh || warn=1
else
  echo "  SKIPPED — install deno then: bash supabase/functions/typecheck.sh"
  warn=1
fi

hr "2 · Migration status (local vs remote)"
echo "  Run:  supabase db push        # applies Phase 1–3 (idempotent)"
echo "  Current:"
supabase migration list --linked < /dev/null 2>/dev/null | sed 's/^/    /' || echo "    (could not reach remote)"

hr "3 · Edge auth + CORS (live, post-deploy)"
if [ -n "$USER_JWT" ]; then
  USER_JWT="$USER_JWT" bash supabase/phase4a_verify.sh || warn=1
else
  bash supabase/phase4a_verify.sh || warn=1
fi

hr "4 · SQL verification gate (run in the Supabase SQL editor)"
cat <<EOF
  Paste & run each; every check should return ZERO rows / expected counts:
    • supabase/phase1_verify.sql   (RLS on all tables, owner policies, tokens 0-policy)
    • supabase/phase2_verify.sql   (user_id present + NOT NULL + indexed; te.user_id == parent)
    • supabase/phase3_verify.sql   (pa_shifts/mandatory_sessions unique(user_id,google_event_id))
  Files on disk:
EOF
ls -1 supabase/phase1_verify.sql supabase/phase2_verify.sql supabase/phase3_verify.sql 2>/dev/null | sed 's/^/    ✓ /'

hr "5 · Second-user isolation (MANUAL — the real gate)"
cat <<'EOF'
  a) Create a throwaway 2nd account (sign up in the app).
  b) As user B, confirm EVERY page shows none of user A's data
     (dashboard, training, health, economy, study, journal, jobb, experiences).
  c) Ask Jarvis (as B) about A's data — must return nothing about A.
  d) Cross-user attachment test (see supabase/phase4a_verify.sh footer):
     as B, call jarvis-chat with one of A's examFileId/materialIds →
     the reply must NOT contain A's content (RLS + .eq('user_id') = 0 rows).
  e) As B, try writing — confirm rows are created with B's user_id only.
EOF

hr "RESULT"
if [ "$warn" -eq 0 ]; then
  echo "  ✅ Automatable checks passed. Complete sections 4–5 manually, then GO."
else
  echo "  ⚠ Some checks were skipped/failed above (often: not deployed yet, or deno missing)."
  echo "    Resolve them, complete sections 4–5, then decide GO/NO-GO."
fi
