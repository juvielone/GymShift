// Readable stand-ins for uuids so mock rows are easy to cross-reference.
// Staff from the client: Carly (manager), Gladys (team lead, also works shifts), cleaners Josh, Kyle, Gino and Angel.

export const CARLY = 'user-carly'
export const GLADYS = 'user-gladys'
export const JOSH = 'user-josh'
export const KYLE = 'user-kyle'
export const GINO = 'user-gino'
export const ANGEL = 'user-angel'

/** Shift ids are derived from date + type, e.g. "shift-2026-10-26-morning". */
export const shiftId = (date: string, type: 'morning' | 'night') => `shift-${date}-${type}`

/** Mock "current time": Wed 28 Oct 2026, 6:50 pm Sydney — Josh's night shift starts in 10 minutes, not clocked in yet. */
export const MOCK_NOW = '2026-10-28T18:50:00+11:00'

/** Monday that starts the mock published fortnight. */
export const FORTNIGHT_START = '2026-10-26'
