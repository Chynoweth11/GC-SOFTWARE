'use client'

import { usePathname } from 'next/navigation'
import { Tabs } from '@/components/ui'

export function AdminTabs({
  canManageCompany,
  canManageReferenceData,
  canManageUsers,
  canImport,
  canRestore,
  canViewAudit,
  canManageClients,
}: {
  canManageCompany: boolean
  canManageReferenceData: boolean
  canManageUsers: boolean
  canImport: boolean
  canRestore: boolean
  canViewAudit: boolean
  canManageClients: boolean
}) {
  const pathname = usePathname()

  return (
    <Tabs
      active={pathname}
      tabs={[
        ...(canManageCompany ? [{ href: '/admin', label: 'Company' }] : []),
        ...(canManageUsers ? [{ href: '/admin/users', label: 'Users and roles' }] : []),
        ...(canManageClients ? [{ href: '/admin/clients', label: 'Clients' }] : []),
        ...(canManageReferenceData
          ? [
              { href: '/admin/trades', label: 'Trades and divisions' },
              { href: '/admin/vendors', label: 'Vendors' },
            ]
          : []),
        ...(canImport ? [{ href: '/admin/import', label: 'Import' }] : []),
        ...(canRestore ? [{ href: '/admin/restore', label: 'Backup and restore' }] : []),
        ...(canViewAudit ? [{ href: '/admin/audit', label: 'Audit history' }] : []),
      ]}
    />
  )
}
