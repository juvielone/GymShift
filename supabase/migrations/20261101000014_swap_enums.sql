-- New value for the swaps in 15_swaps.sql. Its own file, because a new enum value can't be used in the
-- transaction that adds it.

-- The person who asked took the request back before anyone decided it ("I can make it after all").
alter type request_status add value 'withdrawn';
