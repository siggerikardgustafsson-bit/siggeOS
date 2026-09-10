-- ============================================================================
-- POST-DEPLOY · 10 · explicit per-trip city list for the Upplevelser map
-- ----------------------------------------------------------------------------
-- The world map used to guess a trip's cities by parsing the title / city
-- free-text against a gazetteer (fragile: multi-city trips like
-- "Malmö → Kroatien" or "Balkanroad trip" only ever got a country-centroid dot).
--
-- `cities` is an ordered JSON array of { name, lng, lat } — resolved once in the
-- trip form (typeahead against the 24k-city gazetteer) and stored with coords so
-- the map never has to re-geocode. Empty array = fall back to the old parse.
--
-- Idempotent, additive, non-destructive. Owner RLS on trips already covers it.
-- ============================================================================

alter table public.trips
  add column if not exists cities jsonb not null default '[]'::jsonb;

comment on column public.trips.cities is 'Post-deploy 10 — ordered [{name,lng,lat}] the trip visited. Set in the trip form, drives the Upplevelser map. Empty = parse title/city free-text instead.';
