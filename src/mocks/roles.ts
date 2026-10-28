import type { Role } from '@/types'

// From the PRD "Users and roles" permission table.
export const roles: Role[] = [
  {
    id: 'manager',
    label: 'Manager',
    can_publish_roster: 'all',
    can_approve_swaps: 'all',
    can_approve_extensions: true,
    can_correct_attendance: true,
    view_records_scope: 'all',
    can_export_hours: true,
    can_manage_users: true,
  },
  {
    id: 'team_lead',
    label: 'Team lead',
    // Rosters and approves swaps for all cleaners on Carly's behalf (decided 29 Oct 2026).
    can_publish_roster: 'all',
    can_approve_swaps: 'all',
    can_approve_extensions: false,
    can_correct_attendance: false,
    view_records_scope: 'own_group',
    can_export_hours: false,
    can_manage_users: false,
  },
  {
    id: 'cleaner',
    label: 'Cleaner',
    can_publish_roster: false,
    can_approve_swaps: false,
    can_approve_extensions: false,
    can_correct_attendance: false,
    view_records_scope: 'own',
    can_export_hours: false,
    can_manage_users: false,
  },
]
