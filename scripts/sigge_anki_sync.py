#!/usr/bin/env python3
"""Syncs Anki NEW-card history (Spanska/Serbiska/Tyska) to SiggeOS.

Requires Anki Desktop open with the AnkiConnect add-on (code 2055492159).
Every run re-pulls the last BACKFILL_DAYS days and sends them all in one
batch — so a gap (laptop closed, Anki not open that day, this script not
running) self-heals the next time it runs, instead of leaving a hole.

Counts NEW cards learned per day (user call 2026-09-12) — a card's FIRST-
EVER review, across its whole history, not every day it happens to get
reviewed again. Repetitions of already-known cards don't count: languageTier()
(src/lib/languageSkill.js) uses cumulative cards as a vocabulary-SIZE proxy —
"have I been exposed to ~8000 words" — and that only holds if a heavy
reviewer can't inflate the number just by re-reviewing the same words a lot.

Does nothing (exits quietly) if AnkiConnect isn't reachable, i.e. Anki
Desktop isn't open right now — safe to poll often.
"""
import json
import ssl
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import datetime

try:
    # python.org's macOS build ships its own OpenSSL without the system
    # trust store wired in ("Install Certificates.command" normally does
    # that, but isn't always present) — use certifi's bundle if installed
    # so HTTPS works regardless of which python3 ends up running this.
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = None

ANKI_URL = "http://127.0.0.1:8765"
SIGGE_URL = "https://foctdzzbonepdzeubate.supabase.co/functions/v1/skill-ingest"
TOKEN = "5faa80ff-d0d4-47eb-b0b6-411f7e005cdc"  # Installningar -> Apple Health -> kopiera token (samma token)
BACKFILL_DAYS = 30

DECKS = {
    "spanish": "Espanol: 9000 frases con audio",
    "serbian": "Srpsko-Hrvatski",
    "german": "Deutsch: 4000 ord",
}


def anki_request(action, **params):
    payload = json.dumps({"action": action, "version": 6, "params": params}).encode()
    req = urllib.request.Request(ANKI_URL, data=payload)
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    if data.get("error"):
        raise RuntimeError(data["error"])
    return data["result"]


def main():
    try:
        anki_request("version")
    except Exception:
        return  # Anki not open — nothing to do.

    start_ms = (time.time() - BACKFILL_DAYS * 86400) * 1000
    by_day = defaultdict(lambda: defaultdict(set))  # date -> skill -> {cardID, ...}

    for skill, deck in DECKS.items():
        try:
            # deck:"X" (a search query, not cardReviews' own `deck` param) is
            # what actually matches subdecks too — Deutsch/Srpsko-Hrvatski
            # are organized into subdecks, and cardReviews(deck=X) only ever
            # saw cards filed directly under the parent, i.e. none of them.
            card_ids = anki_request("findCards", query=f'deck:"{deck}"')
            reviews_by_card = anki_request("getReviewsOfCards", cards=card_ids) if card_ids else {}
        except Exception as e:
            print(f"skip {deck}: {e}", file=sys.stderr)
            continue
        for card_id, reviews in reviews_by_card.items():
            if not reviews:
                continue
            # The card's first review EVER (not first within the window) —
            # that's the actual "this word is new" moment. A card learned
            # months ago and reviewed again today must not count as new today.
            first_review_ms = min(r["id"] for r in reviews)
            if first_review_ms < start_ms:
                continue
            day = datetime.fromtimestamp(first_review_ms / 1000).date().isoformat()
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
        with urllib.request.urlopen(req, timeout=20, context=SSL_CONTEXT) as r:
            print(r.read().decode())
    except urllib.error.HTTPError as e:
        print(e.read().decode(), file=sys.stderr)


if __name__ == "__main__":
    main()
