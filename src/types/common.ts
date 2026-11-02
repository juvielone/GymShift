// Shared column primitives. These mirror Postgres types in the future Supabase schema.

/** uuid primary / foreign key */
export type Uuid = string

/** timestamptz as an ISO 8601 string with offset, e.g. "2026-10-26T07:02:00+11:00" */
export type Timestamp = string

/** date as "YYYY-MM-DD" (Australia/Sydney local date) */
export type DateString = string

/** time as "HH:mm" (24h, Australia/Sydney local time) */
export type TimeString = string

/** Status shared by every approval-style request (swaps, extensions, correction requests). */
export type RequestStatus = 'pending' | 'approved' | 'declined'
