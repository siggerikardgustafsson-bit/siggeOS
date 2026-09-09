# WORKLOG — autonom natt-session (2026-09-09 → 10)

Branch: `audit-fixes` (avgrenad från `main` @ `e3327b3`).
Regler följda: bara commits på `audit-fixes`, ingen push, ingen deploy, inga
komponent-splittar, ingen ny CSS längst ner i index.css, P3-1 orörd.

Allt som kräver deploy för att märkas är markerat **[DEPLOY]** nedan — kör
`supabase functions deploy <namn>` respektive `supabase db push` när du granskat.

---

## Sammanfattning (fyll på under natten)

| # | Vad | Spår | Filer | Commit | Kräver |
|---|-----|------|-------|--------|--------|
| – | (se poster nedan) | | | | |

---

## Poster

<!-- Ny post överst. Mall:
### N. Rubrik
**Spår:** A
**Varför:** …
**Vad:** …
**Filer:** …
**Verifiering:** …
**Commit:** `<hash>` "<meddelande>"
**Kräver av dig:** inget / `supabase functions deploy x` / `supabase db push`
-->

### 1. Mobillayout för månadskalendern
**Spår:** A (uttryckligen efterfrågat)
**Varför:** 7-kolumnersgriden renderade text-chips i ~50px-celler → varje event
blev en enda bokstav ("S.", "E."). Dag-detaljpanelen var en 300px sidokolumn
som sprack på telefon. Kalendern var i praktiken oanvändbar på mobil.
**Vad:** Under 768px: enbokstavs veckodagsrubriker, ~44px celler, centrerad
dagssiffra, en färgad prick per event-typ den dagen (max 4) istället för chips.
Detaljpanelen hamnar under griden i full bredd och scrollar in i vy vid tap.
Desktop helt oförändrat (verifierat i preview).
**Filer:** `src/pages/Kalender.jsx` (inline `useIsMobile`-hook + `isMobile`-gren
i cell-render och grid-layout; ingen ny CSS)
**Verifiering:** preview 375px — griden får plats, prickar visar rätt färger,
tap på dag 9 öppnar panel med "Gym / Eget arbete / Grupparbete …". Desktop
oförändrat. esbuild-parse OK.
**Commit:** `5f5c7ee` "Kalender: usable month grid on mobile (dots + detail sheet)"
**Kräver av dig:** inget

## Noteringar / observationer för dig

- `git for-each-ref` visar en **dubblerad `refs/remotes/origin/main`** (pekar på
  både `e3327b3` och `161f69d "fix: remove top padding on mobile main"`). Trolig
  rest från iCloud-korruptionen. Ofarligt för arbetet men värt att städa:
  `git remote prune origin` eller ta bort loose ref manuellt. Rörde inte detta.
