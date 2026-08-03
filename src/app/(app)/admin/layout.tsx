import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { forbidden } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { AdminTabs } from '@/components/admin/admin-tabs'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()
  if (!can(user.role, 'manage:reference_data')) forbidden()

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Company defaults, users, reference data and data import — the structures every project is built on"
      />
      <AdminTabs
        canManageUsers={can(user.role, 'manage:users')}
        canImport={can(user.role, 'import:data')}
        canRestore={can(user.role, 'edit:project_setup')}
      />
      {children}
    </>
  )
}
