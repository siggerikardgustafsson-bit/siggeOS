#!/usr/bin/env bash
# ============================================================================
# Edge-function typecheck — catches import errors + TypeScript syntax/type errors
# WITHOUT deploying. Deno is the runtime Supabase Edge Functions use.
#
#   bash supabase/functions/typecheck.sh
#
# Install deno once if missing:  brew install deno   (or: curl -fsSL https://deno.land/install.sh | sh)
# ============================================================================
set -uo pipefail
cd "$(dirname "$0")"

if ! command -v deno >/dev/null 2>&1; then
  echo "deno not installed — install it, then re-run:"
  echo "  brew install deno        # macOS"
  echo "  curl -fsSL https://deno.land/install.sh | sh"
  exit 127
fi

echo "deno $(deno --version | head -1)"
fail=0
for f in */index.ts; do
  [ -f "$f" ] || continue
  echo "── deno check $f ──"
  if deno check "$f"; then
    echo "  OK"
  else
    echo "  FAILED: $f"
    fail=1
  fi
done

# Also typecheck the shared helper directly.
if [ -f _shared/auth.ts ]; then
  echo "── deno check _shared/auth.ts ──"
  deno check _shared/auth.ts && echo "  OK" || { echo "  FAILED: _shared/auth.ts"; fail=1; }
fi

if [ "$fail" -eq 0 ]; then echo "✅ all edge functions typecheck clean"; else echo "❌ typecheck errors above"; fi
exit "$fail"
