import type { Photo } from '@/types'
import { GLADYS, ANGEL, JOSH, shiftId } from './ids'

const photo = (n: number, shift_id: string, user_id: string, uploaded_at: string, expires_at: string, size_bytes: number): Photo => {
  const id = `photo-${String(n).padStart(2, '0')}`
  return { id, shift_id, clock_event_id: null, user_id, storage_path: `shifts/${shift_id}/${id}.jpg`, size_bytes, uploaded_at, expires_at, removed_at: null, removed_by: null }
}

const JOSH_26 = shiftId('2026-10-26', 'morning')
const ANGEL_27 = shiftId('2026-10-27', 'night')
const GLADYS_28 = shiftId('2026-10-28', 'morning')

// expires_at = uploaded_at + 6 months (Sydney is back on AEST, +10:00, by late April).
export const photos: Photo[] = [
  photo(1, JOSH_26, JOSH, '2026-10-26T09:41:00+11:00', '2027-04-26T09:41:00+10:00', 148_200),
  photo(2, JOSH_26, JOSH, '2026-10-26T09:42:00+11:00', '2027-04-26T09:42:00+10:00', 152_900),
  photo(3, JOSH_26, JOSH, '2026-10-26T09:44:00+11:00', '2027-04-26T09:44:00+10:00', 139_600),
  photo(4, JOSH_26, JOSH, '2026-10-26T09:47:00+11:00', '2027-04-26T09:47:00+10:00', 155_100),
  photo(5, ANGEL_27, ANGEL, '2026-10-27T22:10:00+11:00', '2027-04-27T22:10:00+10:00', 150_400),
  photo(6, ANGEL_27, ANGEL, '2026-10-27T22:12:00+11:00', '2027-04-27T22:12:00+10:00', 146_800),
  photo(7, ANGEL_27, ANGEL, '2026-10-27T22:18:00+11:00', '2027-04-27T22:18:00+10:00', 153_300),
  photo(8, GLADYS_28, GLADYS, '2026-10-28T09:50:00+11:00', '2027-04-28T09:50:00+10:00', 144_700),
  photo(9, GLADYS_28, GLADYS, '2026-10-28T09:52:00+11:00', '2027-04-28T09:52:00+10:00', 149_900),
]
