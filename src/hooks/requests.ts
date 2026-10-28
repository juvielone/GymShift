// Pending requests a viewer can decide, shaped for display. Shared by Carly's dashboard and the
// Team section on a team lead's home. Reads only through '@/data'; decisions are made elsewhere.
import { getAvailability, getExtensions, getPermissions, getShifts, getSwaps, getUsers } from '@/data'
import type { Extension, Shift, SiteSettings, Swap, User } from '@/types'
import { approvedExtensionMinutes, canApproveExtension, compareTs } from '@/lib/rules'

export type RequestItem =
  | {
      kind: 'extension'
      id: string
      ext: Extension
      shift: Shift
      requester: User
      /** null when it can be approved; otherwise why not (shown instead of Approve). */
      blocked: string | null
    }
  | {
      kind: 'swap'
      id: string
      swap: Swap
      shift: Shift
      requester: User
      /** Named colleague for a swap, or whoever already picked up a cover. */
      other: User | null
      /** For an open cover: cleaners free that day who could take it. */
      candidates: User[]
    }

export async function loadRequests(viewer: User, settings: SiteSettings): Promise<RequestItem[]> {
  const role = await getPermissions(viewer.id)
  const [users, shifts] = await Promise.all([getUsers({ activeOnly: true }), getShifts({ status: 'published' })])
  const userById = new Map(users.map((u) => [u.id, u]))
  const shiftById = new Map(shifts.map((s) => [s.id, s]))
  const items: RequestItem[] = []

  if (role.can_approve_extensions) {
    for (const ext of await getExtensions({ status: 'pending' })) {
      const shift = shiftById.get(ext.shift_id)
      const requester = userById.get(ext.requested_by)
      if (!shift || !requester) continue
      const others = (await getExtensions({ shiftId: shift.id })).filter((e) => e.id !== ext.id)
      const room = settings.max_shift_min - settings.standard_shift_min - approvedExtensionMinutes(others)
      const blocked = canApproveExtension(ext.minutes, others, settings)
        ? null
        : room > 0
          ? `Only ${room} more minutes can be approved on this shift.`
          : 'This shift already has the most extra time allowed.'
      items.push({ kind: 'extension', id: ext.id, ext, shift, requester, blocked })
    }
  }

  if (role.can_approve_swaps) {
    for (const swap of await getSwaps({ status: 'pending' })) {
      const shift = shiftById.get(swap.shift_id)
      const requester = userById.get(swap.requested_by)
      // Nobody decides their own request.
      if (!shift || !requester || swap.requested_by === viewer.id) continue
      if (role.can_approve_swaps === 'own_group' && requester.team_lead_id !== viewer.id) continue
      const otherId = swap.kind === 'swap' ? swap.target_user_id : swap.covered_by
      let candidates: User[] = []
      if (swap.kind === 'cover' && !swap.covered_by) {
        const [away, sameDay] = await Promise.all([getAvailability({ from: shift.date, to: shift.date }), getShifts({ from: shift.date, to: shift.date })])
        const busy = new Set([...away.map((a) => a.user_id), ...sameDay.map((s) => s.assigned_user_id)])
        candidates = users.filter((u) => u.role !== 'manager' && u.id !== requester.id && !busy.has(u.id))
      }
      items.push({ kind: 'swap', id: swap.id, swap, shift, requester, other: otherId ? (userById.get(otherId) ?? null) : null, candidates })
    }
  }

  // Oldest first: the longest-waiting person is answered first.
  const created = (i: RequestItem) => (i.kind === 'extension' ? i.ext.created_at : i.swap.created_at)
  return items.sort((a, b) => compareTs(created(a), created(b)))
}
