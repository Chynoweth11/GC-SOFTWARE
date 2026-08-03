'use client'

import { usePathname } from 'next/navigation'
import { Tabs } from '@/components/ui'

export function AdminTabs({
  canManageUsers,
  canImport,
  canRestore,
}: {
  canManageUsers: boolean
  canImport: boolean
  canRestore: boolean
}) {
  const pathname = usePathname()

  return (
    <Tabs
      active={pathname}
      tabs={[
        { href: '/admin', label: 'Company' },
        ...(canManageUsers ? [{ href: '/admin/users', label: 'Users and roles' }] : []),
        { href: '/admin/cost-codes', label: 'Cost codes' },
        { href: '/admin/trades', label: 'Trades and divisions' },
        { href: '/admin/vendors', label: 'Vendors' },
        ...(canImport ? [{ href: '/admin/import', label: 'Import' }] : []),
        ...(canRestore ? [{ href: '/admin/restore', label: 'Backup and restore' }] : []),
      ]}
    />
  )
}
