// Table: clock_events — APPEND-ONLY. Never updated or deleted; time fixes go in `corrections`, and a
// clock-in made by mistake is voided in `clock_voids`.
import type { Timestamp, Uuid } from './common'

export type ClockKind = 'in' | 'out'

/** Location outcome at the moment of clocking. Anything other than 'ok' still saves the event (and flags it). */
export type LocationStatus = 'ok' | 'denied' | 'timeout' | 'unavailable'

/** Who made the event: the person's phone, or the scheduled job closing a forgotten session. */
export type ClockSource = 'phone' | 'auto'

export interface ClockEvent {
  id: Uuid
  user_id: Uuid
  /** null = unscheduled clock-in/out (allowed, but flagged). */
  shift_id: Uuid | null
  kind: ClockKind
  /** Server-recorded time. The phone's clock is never trusted. */
  server_time: Timestamp
  location_status: LocationStatus
  lat: number | null
  lng: number | null
  /** GPS accuracy radius in metres, as reported by the browser. */
  accuracy_m: number | null
  /** Distance from the gym in metres, computed server-side. */
  distance_m: number | null
  /** 'auto' only on a clock-out: the session was left open, so the job closed it (no location). */
  source: ClockSource
  /** 'auto' only: the end the job assumed (rostered end plus approved extra time), used as its time. */
  assumed_time: Timestamp | null
}
