'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { ProjectFilter } from '@/lib/queries/company'
import { CATEGORY_LABELS, COST_CATEGORIES } from '@/lib/finance/cost'

const STATUSES = [
  ['ACTIVE', 'Active'],
  ['BIDDING', 'Bidding'],
  ['AWARDED', 'Awarded'],
  ['PRECONSTRUCTION', 'Preconstruction'],
  ['UNDER_CONSTRUCTION', 'Under construction'],
  ['COMPLETED', 'Completed'],
  ['CLOSED', 'Closed'],
  ['ON_HOLD', 'On hold'],
] as const

const HEALTH = [
  ['OK', 'Healthy'],
  ['WATCH', 'On watch'],
  ['HIGH RISK', 'High risk'],
] as const

export function ProjectFilters({
  options,
  current,
  showCostTypes = false,
}: {
  options: {
    managers: { id: string; name: string }[]
    clients: { id: string; name: string }[]
    projectTypes: string[]
    locations: string[]
  }
  current: ProjectFilter
  /** Only the line-level reports have a cost type to narrow by. */
  showCostTypes?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const update = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set(key, value)
      else params.delete(key)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      const existing = (params.get(key) ?? '').split(',').filter(Boolean)
      const next = existing.includes(value) ? existing.filter((v) => v !== value) : [...existing, value]
      if (next.length) params.set(key, next.join(','))
      else params.delete(key)
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams],
  )

  const activeCount =
    (current.status?.length ?? 0) +
    (current.health?.length ?? 0) +
    (current.costType?.length ?? 0) +
    (current.pmUserId ? 1 : 0) +
    (current.clientId ? 1 : 0) +
    (current.projectType ? 1 : 0) +
    (current.location ? 1 : 0)

  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-2.5 p-3 no-print">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Status</span>
        {STATUSES.map(([value, label]) => {
          const active = current.status?.includes(value)
          return (
            <button
              key={value}
              onClick={() => toggleMulti('status', value)}
              className="pill transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'var(--surface-inset)',
                color: active ? '#fff' : 'var(--text-muted)',
              }}
              aria-pressed={active}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label mr-1">Health</span>
        {HEALTH.map(([value, label]) => {
          const active = current.health?.includes(value as never)
          return (
            <button
              key={value}
              onClick={() => toggleMulti('health', value)}
              className="pill transition-colors"
              style={{
                background: active ? 'var(--accent)' : 'var(--surface-inset)',
                color: active ? '#fff' : 'var(--text-muted)',
              }}
              aria-pressed={active}
            >
              {label}
            </button>
          )
        })}
      </div>

      {showCostTypes && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label mr-1">Cost type</span>
          {COST_CATEGORIES.map((value) => {
            const active = current.costType?.includes(value)
            return (
              <button
                key={value}
                onClick={() => toggleMulti('costType', value)}
                className="pill transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'var(--surface-inset)',
                  color: active ? '#fff' : 'var(--text-muted)',
                }}
                aria-pressed={active}
              >
                {CATEGORY_LABELS[value]}
              </button>
            )
          })}
        </div>
      )}

      <select
        className="field w-auto py-1 text-xs"
        value={current.pmUserId ?? ''}
        onChange={(e) => update('pm', e.target.value || null)}
        aria-label="Filter by project manager"
      >
        <option value="">All managers</option>
        {options.managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      <select
        className="field w-auto py-1 text-xs"
        value={current.clientId ?? ''}
        onChange={(e) => update('client', e.target.value || null)}
        aria-label="Filter by client"
      >
        <option value="">All clients</option>
        {options.clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {options.projectTypes.length > 0 && (
        <select
          className="field w-auto py-1 text-xs"
          value={current.projectType ?? ''}
          onChange={(e) => update('type', e.target.value || null)}
          aria-label="Filter by project type"
        >
          <option value="">All types</option>
          {options.projectTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}

      {options.locations.length > 0 && (
        <select
          className="field w-auto py-1 text-xs"
          value={current.location ?? ''}
          onChange={(e) => update('location', e.target.value || null)}
          aria-label="Filter by location"
        >
          <option value="">All locations</option>
          {options.locations.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}

      {activeCount > 0 && (
        <button onClick={() => router.push(pathname, { scroll: false })} className="btn btn-ghost ml-auto text-xs">
          Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}
