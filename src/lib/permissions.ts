import type { Role } from '@/generated/prisma/client'

/**
 * Capability model. Roles map to capabilities; pages and server actions check
 * capabilities, never role names, so a permission change is one edit here.
 */
export type Capability =
  // read scopes
  | 'view:company_financials'
  | 'view:project_financials'
  | 'view:margins'
  | 'view:labor_rates'
  | 'view:markups'
  | 'view:cash_position'
  | 'view:estimates'
  | 'view:pipeline'
  | 'view:wage_rates'
  // write scopes
  | 'edit:project_setup'
  | 'edit:budget'
  | 'edit:costs'
  | 'edit:commitments'
  | 'edit:change_orders'
  | 'approve:contract_documents'
  | 'unapprove:contract_documents'
  | 'edit:owner_billing'
  | 'edit:sub_billing'
  | 'edit:forecast'
  | 'lock:forecast'
  | 'edit:estimates'
  | 'edit:pipeline'
  | 'edit:wage_rates'
  | 'award:bid'
  | 'edit:company_settings'
  | 'manage:users'
  | 'manage:reference_data'
  | 'manage:clients'
  | 'delete:records'
  | 'view:audit'
  | 'import:data'

const ALL: Capability[] = [
  'view:company_financials',
  'view:project_financials',
  'view:margins',
  'view:labor_rates',
  'view:markups',
  'view:cash_position',
  'view:estimates',
  'view:pipeline',
  'view:wage_rates',
  'edit:project_setup',
  'edit:budget',
  'edit:costs',
  'edit:commitments',
  'edit:change_orders',
  'approve:contract_documents',
  'unapprove:contract_documents',
  'edit:owner_billing',
  'edit:sub_billing',
  'edit:forecast',
  'lock:forecast',
  'edit:estimates',
  'edit:pipeline',
  'edit:wage_rates',
  'award:bid',
  'edit:company_settings',
  'manage:users',
  'manage:reference_data',
  'manage:clients',
  'delete:records',
  'view:audit',
  'import:data',
]

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  OWNER: ALL,
  ADMIN: ALL,

  EXECUTIVE: [
    'view:company_financials',
    'view:project_financials',
    'view:margins',
    'view:markups',
    'view:cash_position',
    'view:estimates',
    'view:pipeline',
    'view:wage_rates',
    'award:bid',
    'approve:contract_documents',
    'view:audit',
  ],

  PROJECT_MANAGER: [
    'view:project_financials',
    'view:margins',
    'view:estimates',
    'view:wage_rates',
    'edit:project_setup',
    'edit:budget',
    'edit:costs',
    'edit:commitments',
    'edit:change_orders',
    'approve:contract_documents',
    'edit:owner_billing',
    'edit:sub_billing',
    'edit:forecast',
    'lock:forecast',
    'edit:wage_rates',
    'import:data',
    'manage:clients',
  ],

  PROJECT_ENGINEER: [
    'view:project_financials',
    'view:wage_rates',
    'edit:costs',
    'edit:commitments',
    'edit:change_orders',
    'edit:sub_billing',
    'edit:forecast',
  ],

  ESTIMATOR: [
    'view:project_financials',
    'view:labor_rates',
    'view:markups',
    'view:estimates',
    'view:pipeline',
    'view:wage_rates',
    'edit:estimates',
    'edit:pipeline',
    'edit:wage_rates',
    'import:data',
    'manage:clients',
  ],

  ACCOUNTING: [
    'view:company_financials',
    'view:project_financials',
    'view:cash_position',
    'view:wage_rates',
    'edit:costs',
    'edit:owner_billing',
    'edit:sub_billing',
    'edit:wage_rates',
    'import:data',
    'manage:clients',
    'view:audit',
  ],

  FINANCE: [
    'view:company_financials',
    'view:project_financials',
    'view:margins',
    'view:markups',
    'view:cash_position',
    'view:estimates',
    'view:pipeline',
    'view:wage_rates',
    'edit:forecast',
    'lock:forecast',
    'import:data',
    'manage:clients',
    'view:audit',
  ],

  READ_ONLY: ['view:project_financials'],
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Company owner',
  ADMIN: 'Administrator',
  EXECUTIVE: 'Executive',
  PROJECT_MANAGER: 'Project manager',
  PROJECT_ENGINEER: 'Project engineer',
  ESTIMATOR: 'Estimator',
  ACCOUNTING: 'Accounting',
  FINANCE: 'Finance',
  READ_ONLY: 'Read-only',
}

export function can(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability)
}

export function capabilitiesFor(role: Role): Capability[] {
  return ROLE_CAPABILITIES[role]
}

/** Throws in a server action when the caller lacks the capability. */
export function assertCan(role: Role, capability: Capability): void {
  if (!can(role, capability)) {
    throw new Error(`Your role (${ROLE_LABELS[role]}) is not permitted to ${capability.replace(':', ' ')}.`)
  }
}
