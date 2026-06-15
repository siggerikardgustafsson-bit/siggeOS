#!/usr/bin/env bash
# ============================================================================
# PHASE 3 · edge-function auth verification. Run AFTER deploying the functions.
#
#   bash supabase/phase3_verify_auth.sh                 # tests the 401 paths
#   USER_JWT=<logged-in user's access_token> bash supabase/phase3_verify_auth.sh
#
# Get a USER_JWT from the browser devtools console while logged in:
#   JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.endsWith('-auth-token')))).access_token
#
# Expected results once the new functions are deployed:
#   OPTIONS preflight  -> 200
#   anon-key-only POST -> 401   (the public anon key carries no user)
#   no-Authorization   -> 401
#   authed user POST   -> NOT 401  (price-fetch ~200)
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env 2>/dev/null; set +a
URL="${VITE_SUPABASE_URL:?set in .env}"; ANON="${VITE_SUPABASE_ANON_KEY:?set in .env}"
USER_JWT="${USER_JWT:-}"

code() { # method bearer fn body
  curl -s -o /dev/null -w "%{http_code}" -X "$1" "$URL/functions/v1/$3" \
    -H "apikey: $ANON" -H "Authorization: Bearer $2" \
    -H "Content-Type: application/json" -d "$4"
}

for FN in price-fetch insights-ai; do
  echo "== $FN =="
  printf "  OPTIONS preflight  : %s   (expect 200)\n" "$(code OPTIONS "$ANON" "$FN" '')"
  printf "  anon-key-only POST : %s   (expect 401)\n" "$(code POST "$ANON" "$FN" '{}')"
done

echo "== authed positive path =="
if [ -n "$USER_JWT" ]; then
  printf "  price-fetch (authed): %s   (expect NOT 401)\n" "$(code POST "$USER_JWT" price-fetch '{"assets":[]}')"
  echo "  insights-ai (authed): SKIPPED on purpose — calling it spends Anthropic tokens"
else
  echo "  SKIPPED — set USER_JWT to verify authenticated calls still succeed"
fi
