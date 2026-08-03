'use client'

import { usePathname } from 'next/navigation'
import { Tabs } from '@/components/ui'

export function EstimateTabs({ estimateId, qaIssues }: { estimateId: string; qaIssues: number }) {
  const pathname = usePathname()
  const base = `/estimating/${estimateId}`

  return (
    <Tabs
      active={pathname}
      tabs={[
        { href: base, label: 'Bid summary', badge: qaIssues },
        { href: `${base}/takeoff`, label: 'Takeoff' },
        { href: `${base}/gc`, label: 'General conditions' },
        { href: `${base}/leveling`, label: 'Sub quotes & leveling' },
        { href: `${base}/setup`, label: 'Setup & markups' },
      ]}
    />
  )
}
