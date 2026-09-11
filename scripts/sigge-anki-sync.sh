#!/bin/bash
# Syncs today's Anki card counts (Spanska/Serbiska/Tyska) to SiggeOS.
# Requires: Anki Desktop running with the AnkiConnect add-on (code 2055492159).
# Does nothing (exits silently) if Anki isn't open — safe to poll often.
set -euo pipefail

ANKI_URL="http://127.0.0.1:8765"
SIGGE_URL="https://foctdzzbonepdzeubate.supabase.co/functions/v1/skill-ingest"
TOKEN="PASTE_DIN_INGEST_TOKEN_HAR"   # Instillningar -> Apple Health -> kopiera token (samma token, ny endpoint)

# Anki not running / AnkiConnect not reachable -> nothing to do.
if ! curl -s -m 3 -o /dev/null "$ANKI_URL"; then
  exit 0
fi

count_cards() {
  local deck="$1"
  curl -s -m 5 "$ANKI_URL" \
    -X POST \
    -d "{\"action\":\"findCards\",\"version\":6,\"params\":{\"query\":\"deck:\\\"${deck}\\\" rated:1\"}}" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('result') or []))"
}

SPANISH=$(count_cards "Espanol: 9000 frases con audio")
SERBIAN=$(count_cards "Srpsko-Hrvatski")
GERMAN=$(count_cards "Deutsch: 4000 ord")

curl -s -m 10 "$SIGGE_URL" \
  -X POST \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"skills\":[{\"skill\":\"spanish\",\"cards\":${SPANISH}},{\"skill\":\"serbian\",\"cards\":${SERBIAN}},{\"skill\":\"german\",\"cards\":${GERMAN}}]}" \
  > /tmp/sigge-anki-sync.log 2>&1
