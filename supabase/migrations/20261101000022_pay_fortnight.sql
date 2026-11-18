-- Fortnights follow Carly's pay cycle (decided 17 Nov 2026): 2–15 Nov, 16–29 Nov, ... instead of 9–22 Nov.
-- The anchor moves back one week to Mon 19 Oct 2026 (same rhythm as 2 Nov), or further back in whole
-- fortnights if any shift is older, so every earlier fortnight stays reachable on the roster.
--
-- shifts.fortnight_start is a stored grouping (the roster, publish and the hours export filter on it), so it
-- is recalculated for every shift. Only that column changes: dates, times, people and status stay as they
-- were, and nothing is added to shift_changes (fortnight_start is not a logged field). The change trigger is
-- off for this one statement because it refuses any update to a cancelled shift.

update public.site_settings s
set roster_anchor_date = '2026-10-19'::date
  - 14 * ceil(greatest(0, '2026-10-19'::date - coalesce((select min(sh.date) from public.shifts sh), '2026-10-19'::date)) / 14.0)::integer
where s.roster_anchor_date is not null;

alter table public.shifts disable trigger shifts_change;

update public.shifts sh
set fortnight_start = private.fortnight_start_of(sh.date)
where sh.fortnight_start is distinct from private.fortnight_start_of(sh.date);

alter table public.shifts enable trigger shifts_change;
