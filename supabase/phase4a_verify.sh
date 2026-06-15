#!/usr/bin/env bash
# ============================================================================
# PHASE 4A · edge-function auth + CORS verification. Run AFTER deploying.
#
#   bash supabase/phase4a_verify.sh                       # 401 + CORS checks
#   USER_JWT=<logged-in access_token> bash supabase/phase4a_verify.sh   # + authed paths
#
# Get USER_JWT from the browser console while logged in:
#   JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('-auth-token')))).access_token
#
# Expected once deployed:
#   OPTIONS                -> 200, Access-Control-Allow-Origin present
#     (if ALLOWED_ORIGINS unset -> '*'; if set -> echoes the test Origin or first allowed)
#   anon-key-only POST     -> 401  (public anon key carries no user)
#   authed price-fetch     -> NOT 401
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env 2>/dev/null; set +a
URL="${VITE_SUPABASE_URL:?set in .env}"; ANON="${VITE_SUPABASE_ANON_KEY:?set in .env}"
USER_JWT="${USER_JWT:-}"
ORIGIN="${ORIGIN:-http://localhost:5173}"
FUNCS="jarvis-chat strava-sync google-calendar-sync price-fetch"   # insights-ai removed in Phase 4B

code()   { curl -s -o /dev/null -w "%{http_code}" -X "$1" "$URL/functions/v1/$3" -H "apikey: $ANON" -H "Authorization: Bearer $2" -H "Content-Type: application/json" -H "Origin: $ORIGIN" ${4:+-d "$4"}; }
allow()  { curl -s -D - -o /dev/null -X OPTIONS "$URL/functions/v1/$1" -H "Origin: $ORIGIN" -H "Access-Control-Request-Method: POST" | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2}' | tr -d '\r'; }

echo "### Unauthenticated (anon key only) must be rejected ###"
for fn in $FUNCS; do
  printf "  %-22s anon POST -> %s   (expect 401)\n" "$fn" "$(code POST "$ANON" "$fn" '{}')"
done

echo "### CORS preflight (OPTIONS) ###"
for fn in $FUNCS; do
  printf "  %-22s OPTIONS=%s  Allow-Origin=%s\n" "$fn" "$(code OPTIONS "$ANON" "$fn" '')" "$(allow "$fn")"
done

echo "### Authenticated paths ###"
if [ -n "$USER_JWT" ]; then
  printf "  price-fetch authed -> %s   (expect NOT 401)\n" "$(code POST "$USER_JWT" price-fetch '{"assets":[]}')"
  printf "  jarvis-chat authed -> %s   (expect NOT 401)\n" "$(code POST "$USER_JWT" jarvis-chat '{"messages":[{"role":"user","content":"hej"}]}')"
else
  echo "  SKIPPED — set USER_JWT to verify authenticated calls still succeed"
fi

cat <<'NOTE'

### Manual cross-user isolation test (needs TWO accounts) ###
As user B, find one of user A's course_materials / exam_old_files ids, then call:
  curl -s "$VITE_SUPABASE_URL/functions/v1/jarvis-chat" \
    -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Authorization: Bearer <USER_B_JWT>" \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"sammanfatta materialet"}],"examFileId":"<USER_A_FILE_ID>"}'
Expect: the reply must NOT contain user A's file content. jarvis-chat now runs on
the per-request JWT/RLS client AND filters by .eq('user_id', user.id), so the
foreign id resolves to zero rows.
NOTE
