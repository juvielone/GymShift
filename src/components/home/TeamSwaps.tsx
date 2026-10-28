// Team lead's "Team" section on their own home: swap and cover requests to decide for all cleaners.
// Shown only when the role can approve swaps; never flags, extra time or export (Carly only).
import { useCallback, useEffect, useState } from 'react'
import { getPermissions } from '@/data'
import type { SiteSettings, Timestamp, User } from '@/types'
import { loadRequests, type RequestItem } from '@/hooks/requests'
import { Section } from '@/components/common/ListParts'
import { RequestList } from '@/components/requests/RequestList'

export function TeamSwaps({ user, settings, now }: { user: User; settings: SiteSettings; now: Timestamp }) {
  const [items, setItems] = useState<RequestItem[] | null>(null)

  const load = useCallback(async () => {
    const role = await getPermissions(user.id)
    setItems(role.can_approve_swaps && role.id !== 'manager' ? await loadRequests(user, settings) : null)
  }, [user, settings])

  useEffect(() => {
    void load()
  }, [load])

  if (!items) return null
  return (
    <Section id="team-title" title="Team · swaps to approve" count={items.length} empty="No swaps or covers waiting.">
      <RequestList items={items} viewer={user} tz={settings.timezone} now={now} onChanged={() => void load()} />
    </Section>
  )
}
