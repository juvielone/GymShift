// Fortnight hours per cleaner from corrected times, and the CSV export Carly pays from.
// Totals are never cut or rounded down; open sessions are listed, not counted.
import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { getFortnightHours } from '@/data'
import type { FortnightHours } from '@/data'
import type { DateString } from '@/types'
import { smallButton } from '@/components/common/listStyles'
import { downloadCsv, toCsv } from '@/lib/csv'
import { formatDateShort, formatDuration } from '@/lib/format'
import { addDays } from '@/lib/rules'

/** "H:MM", matching the totals shown on screen. */
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
/** Decimal hours for payroll tools; derived from exact minutes and never rounded down. */
const decimal = (min: number) => (Math.ceil((min * 5) / 3) / 100).toFixed(2) // whole-number maths: min/60 to 2dp, rounded up

/** `refreshedAt` changes whenever the dashboard reloads, so corrections show up straight away. */
export function HoursPanel({ fortnights, current, refreshedAt }: { fortnights: DateString[]; current: DateString; refreshedAt: string }) {
  const [start, setStart] = useState(current)
  const [rows, setRows] = useState<FortnightHours[] | null>(null)
  const idx = fortnights.indexOf(start)
  const end = addDays(start, 13)

  useEffect(() => {
    let live = true
    void getFortnightHours(start).then((r) => live && setRows(r))
    return () => {
      live = false
    }
  }, [start, refreshedAt])

  function exportCsv() {
    if (!rows) return
    const csv = toCsv(
      // Exact minutes are the record; H:MM and decimal hours are derived from them.
      ['Name', 'Rostered minutes', 'Unscheduled minutes', 'Total minutes', 'Total (H:MM)', 'Total hours (decimal, derived)', 'Still on shift (not counted)'],
      rows.map((r) => [r.full_name, r.rostered_min, r.unscheduled_min, r.total_min, hm(r.total_min), decimal(r.total_min), r.open_sessions]),
    )
    downloadCsv(`gymshift-hours-${start}-to-${end}.csv`, csv)
  }

  const nav = 'flex size-11 items-center justify-center rounded-xl border border-border active:bg-muted disabled:bg-muted disabled:text-muted-foreground'

  return (
    <section aria-labelledby="hours-title" className="mt-6">
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <h2 id="hours-title" className="text-base font-semibold">
            Fortnight hours
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatDateShort(start)} – {formatDateShort(end)}
          </p>
        </div>
        <div className={fortnights.length > 1 ? 'flex gap-1.5' : 'hidden'}>
          <button type="button" aria-label="Earlier fortnight" disabled={idx <= 0} onClick={() => setStart(fortnights[idx - 1])} className={nav}>
            <ChevronLeft aria-hidden className="size-5" />
          </button>
          <button type="button" aria-label="Later fortnight" disabled={idx < 0 || idx >= fortnights.length - 1} onClick={() => setStart(fortnights[idx + 1])} className={nav}>
            <ChevronRight aria-hidden className="size-5" />
          </button>
        </div>
      </div>

      {rows && rows.length === 0 && <p className="border-b border-border px-1 py-3 text-[15px] text-muted-foreground">No hours recorded yet.</p>}
      {rows && rows.length > 0 && (
        <table className="mt-2 w-full text-[15px]">
          <thead className="sr-only">
            <tr>
              <th>Name</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-border">
                <td className="px-1 py-2.5">
                  {r.full_name}
                  {r.open_sessions > 0 && <span className="block text-[13px] text-warn">On shift now · not counted yet</span>}
                </td>
                <td className="px-1 py-2.5 text-right font-semibold">{formatDuration(r.total_min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <button type="button" onClick={exportCsv} disabled={!rows || rows.length === 0} className={`${smallButton.ink} mt-3 w-full gap-2`}>
        <Download aria-hidden className="size-[18px]" />
        Export CSV
      </button>
      <p className="mt-2 px-1 text-[13px] text-muted-foreground">Uses corrected times. Hours are never cut.</p>
    </section>
  )
}
