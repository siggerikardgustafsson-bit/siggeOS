-- post_deploy_29 — per-day jour rates (e.g. söndagsjour 82 kr/h vs 41 kr/h).
-- Same rule format as ob_rules; on a 'sov' shift, a jour hour is paid the
-- highest matching jour rule, else the flat jour_rate (src/lib/pay.js).
alter table public.employments add column if not exists jour_rules jsonb not null default '[]'::jsonb;
