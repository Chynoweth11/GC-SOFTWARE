'use client'

import { usePathname } from 'next/navigation'
import { Tabs } from '@/components/ui'

export function ProjectTabs({ projectId, alertCount }: { projectId: string; alertCount: number }) {
  const pathname = usePathname()
  const base = `/projects/${projectId}`

  const tabs = [
    { href: base, label: 'Summary', badge: alertCount },
    { href: `${base}/estimate`, label: 'Estimate and takeoff' },
    { href: `${base}/budget`, label: 'Budget' },
    { href: `${base}/costs`, label: 'Job cost' },
    { href: `${base}/commitments`, label: 'Commitments' },
    { href: `${base}/changes`, label: 'Change orders' },
    { href: `${base}/billing`, label: 'Owner billing' },
    { href: `${base}/subs`, label: 'Subcontractors' },
    { href: `${base}/forecast`, label: 'Forecast' },
    { href: `${base}/poc`, label: 'Percent complete' },
    { href: `${base}/cashflow`, label: 'Cash flow' },
    { href: `${base}/buyout`, label: 'Buyout' },
    { href: `${base}/quantities`, label: 'Quantities' },
    { href: `${base}/settings`, label: 'Settings' },
  ]

  return <Tabs tabs={tabs} active={pathname} />
}
