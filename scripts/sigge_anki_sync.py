#!/usr/bin/env python3
"""Syncs Anki card-review history (Spanska/Serbiska/Tyska) to SiggeOS.

Requires Anki Desktop open with the AnkiConnect add-on (code 2055492159).
Every run re-pulls the last BACKFILL_DAYS days and sends them all in one
batch — so a gap (laptop closed, Anki not open that day, this script not
running) self-heals the next time it runs, instead of leaving a hole.
Counts UNIQUE cards touched per day (not raw review events, so a card you
got wrong and re-saw the same day isn't counted twice) — matches what
"X cards reviewed today" means in Anki's own UI.

Does nothing (exits quietly) if AnkiConnect isn't reachable, i.e. Anki
Desktop isn't open right now — safe to poll often.
"""
import json
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime

ANKI_URL = "http://127.0.0.1:8765"
SIGGE_URL = "https://foctdzzbonepdzeubate.supabase.co/functions/v1/skill-ingest"
TOKEN = "PASTE_DIN_INGEST_TOKEN_HAR"  # Installningar -> Apple Health -> kopiera token (samma token)
BACKFILL_DAYS = 30

DECKS = {
    "spanish": "Espanol: 9000 frases con audio",
    "serbian": "Srpsko-Hrvatski",
    "german": "Deutsch: 4000 ord",
}


def anki_request(action, **params):
    payload = json.dumps({"action": action, "version": 6, "params": params}).encode()
    req = urllib.request.Request(ANKI_URL, data=payload)
    with urllib.request.urlopen(req, timeout=5) as r:
        data = json.loads(r.read())
    if data.get("error"):
        raise RuntimeError(data["error"])
    return data["result"]


def main():
    try:
        anki_request("version")
    except Exception:
        return  # Anki not open — nothing to do.

    start_id = int((time.time() - BACKFILL_DAYS * 86400) * 1000)
    by_day = defaultdict(lambda: defaultdict(set))  # date -> skill -> {cardID, ...}

    for skill, deck in DECKS.items():
        try:
            reviews = anki_request("cardReviews", deck=deck, startID=start_id)
        except Exception as e:
            print(f"skip {deck}: {e}", file=sys.stderr)
            continue
        for review_time_ms, card_id, *_rest in reviews:
            day = datetime.fromtimestamp(review_time_ms / 1000).date().isoformat()
            by_day[day][skill].add(card_id)

    if not by_day:
        return

    days_payload = [
        {"date": d, "skills": [{"skill": s, "cards": len(ids)} for s, ids in skills.items()]}
        for d, skills in sorted(by_day.items())
    ]

    body = json.dumps({"days": days_payload}).encode()
    req = urllib.request.Request(
        SIGGE_URL, data=body, method="POST",
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(r.read().decode())
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)


if __name__ == "__main__":
    main()
