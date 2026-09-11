-- Transfer-between-own-accounts detection (user call 2026-09-14) needs to
-- know each linked account's OWN IBAN, to compare against a transaction's
-- counterparty IBAN. Not captured when bank_connections was first designed.
alter table public.bank_connections add column if not exists iban text;
comment on column public.bank_connections.iban is 'This account''s own IBAN (from /accounts/{uid}/details) — used to detect transfers between the user''s own linked accounts.';
