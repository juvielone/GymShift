// Table: clock_events — APPEND-ONLY. Never updated or deleted; time fixes go in `corrections`.
import type { Timestamp, Uuid } from './common'

export type ClockKind = 'in' | 'out'

/** Location outcome at the moment of clocking. Anything other than 'ok' still saves the event (and flags it). */
export type LocationStatus = 'ok' | 'denied' | 'timeout' | 'unavailable'

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
}
