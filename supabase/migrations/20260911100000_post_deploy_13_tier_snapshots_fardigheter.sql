-- Sömn+Hälsa merge / Färdigheter split (user call 2026-09-11, see
-- src/lib/tierProfiles.js for the full change note). Färdigheter (gitarr +
-- språk) becomes its own ranking category, split out of Studier — needs a
-- snapshot column so Jarvis's offline reconstruction (src/lib/jarvis/index.js
-- reconstructFromSnapshot) stays consistent with the live Dashboard score.
-- Sömn's old column ('somn') is left in place (frozen, historical only) —
-- it's folded into 'valmående' (Hälsa) going forward, no data loss either way.
alter table public.tier_snapshots add column if not exists fardigheter integer;
comment on column public.tier_snapshots.fardigheter is 'Färdigheter (gitarr+språk) tier — split out of Studier 2026-09-11.';
