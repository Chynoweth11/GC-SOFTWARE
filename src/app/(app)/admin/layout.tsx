import { requireUser } from '@/lib/auth'
import { can, type Capability } from '@/lib/permissions'
import { forbidden } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { AdminTabs } from '@/components/admin/admin-tabs'

/**
 * Entry is granted by holding any one of the settings capabilities, not by
 * holding the reference-data one specifically. An executive who may read the
 * audit history but not edit a line item still needs to get through this door.
 */
const SETTINGS_CAPABILITIES: Capability[] = [
  'manage:reference_data',
  'manage:users',
  'manage:clients',
  'view:audit',
  'import:data',
  'edit:company_settings',
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (!SETTINGS_CAPABILITIES.some((capability) => can(user.role, capability))) forbidden()

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Company defaults, people, clients, reference data and the permanent audit history"
      />
      <AdminTabs
        canManageCompany={can(user.role, 'edit:company_settings')}
        canManageReferenceData={can(user.role, 'manage:reference_data')}
        canManageUsers={can(user.role, 'manage:users')}
        canImport={can(user.role, 'import:data')}
        canRestore={can(user.role, 'edit:project_setup')}
        canViewAudit={can(user.role, 'view:audit')}
        canManageClients={can(user.role, 'manage:clients')}
      />
      {children}
    </>
  )
}
