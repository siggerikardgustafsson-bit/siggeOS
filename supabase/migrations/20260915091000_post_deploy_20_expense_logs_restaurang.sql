-- Same root cause as post_deploy_19 (health_logs.marijuana): 'restaurang'
-- was added to EXPENSE_CATEGORIES (Ekonomi.jsx) and to ekonomi-sync's
-- categorization keywords when 'mat' (groceries) was split from eating-out
-- 2026-09-14, but expense_logs' CHECK constraint was never updated to
-- allow it. Broke BOTH the bank sync (a batch upsert containing any
-- 'restaurang' row fails the whole statement — surfaced as
-- "expense_logs_category_check" violation, confirmed against the real
-- checking account's real restaurant/café purchases) AND manual logging
-- (the "Logga" tab lets you pick "Uteätande" as a category, which is the
-- same 'restaurang' value — would fail identically).
alter table public.expense_logs drop constraint expense_logs_category_check;
alter table public.expense_logs add constraint expense_logs_category_check
  check (category = ANY (ARRAY['mat'::text, 'restaurang'::text, 'nöje'::text, 'transport'::text, 'kläder'::text, 'hälsa'::text, 'prenumerationer'::text, 'hyra'::text, 'övrigt'::text]));
