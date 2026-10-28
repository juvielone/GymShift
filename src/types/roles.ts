// Table: roles (lookup). Permission flags mirror the PRD "Users and roles" table.
// Real enforcement will live in Supabase row-level security; these flags drive the UI only.

export type RoleId = 'manager' | 'team_lead' | 'cleaner'

/** 'all' = every staff member, 'own_group' = users whose team_lead_id is this user, 'own' = self only */
export type Scope = 'all' | 'own_group' | 'own'

export interface Role {
  id: RoleId
  label: string
  /** Create and publish roster. `false` = cannot. */
  can_publish_roster: Exclude<Scope, 'own'> | false
  /** Approve swaps and covers. `false` = cannot. */
  can_approve_swaps: Exclude<Scope, 'own'> | false
  /** Carly only (confirmed business rule). */
  can_approve_extensions: boolean
  /** Review flags and correct attendance times. */
  can_correct_attendance: boolean
  /** View photos, notes and hours. */
  view_records_scope: Scope
  can_export_hours: boolean
  can_manage_users: boolean
}
