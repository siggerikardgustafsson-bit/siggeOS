-- post_deploy_11: skill_logs gets an activity_type dimension.
-- Lets a language skill (spanish/serbian/german) split its logged minutes
-- into 'anki' (flashcard review) vs 'ci' (comprehensible input) so those can
-- be seen separately, without changing how they're SUMMED for the skill's
-- total minutes/week (skill still identifies the language; activity_type is
-- an extra tag). NULL = general/unspecified — covers guitar/piano/reading/
-- other and any pre-existing row. Additive, idempotent.
alter table public.skill_logs add column if not exists activity_type text;

comment on column public.skill_logs.activity_type is
  'Optional sub-type for language skills: anki | ci (comprehensible input) | null (general/unspecified).';
