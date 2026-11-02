-- New values for the attendance fixes in 12_attendance_fixes.sql. Their own file, because a new enum
-- value can't be used in the transaction that adds it.

-- A session clocked out within a couple of minutes, and a clock-in far from the rostered start (flag only).
alter type flag_kind add value 'short_session';
alter type flag_kind add value 'off_start';

-- Who made a clock event: the person's phone, or the scheduled job closing a forgotten session.
create type clock_source as enum ('phone', 'auto');

-- What a cleaner asks Carly to fix: drop a clock-in made by mistake, or set when they really finished.
create type correction_request_kind as enum ('void', 'end_time');
create type correction_reason as enum ('accidental_tap', 'wrong_time', 'forgot_clock_out', 'confirm_auto_close', 'other');
