-- The "Alkohol & Nikotin" widget (Halsa.jsx) and jarvis-chat's log_health
-- tool have referenced health_logs.marijuana since the widget was built,
-- but the column was never actually created — every save from that widget
-- upserts {..., marijuana: ...} in the SAME statement as alcohol_units and
-- nicotine, so the whole row upsert has been failing outright with
-- "column health_logs.marijuana does not exist" (user report 2026-09-15,
-- "fixa så att alkoholloggen funkar som den ska" — not a UI bug, the
-- column this whole widget writes to was simply missing).
alter table public.health_logs add column if not exists marijuana boolean default false;
comment on column public.health_logs.marijuana is 'Whether marijuana was used that day — logged alongside alcohol/nicotine in the Halsa "Alkohol & Nikotin" widget.';
