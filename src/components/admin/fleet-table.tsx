'use client'

import { Fragment, useMemo, useState } from 'react'
import Link from 'next/link'
import { EmptyState, Pill } from '@/components/ui'
import { hours, money, percent } from '@/lib/format'

/**
 * Every machine, and what it is actually doing.
 *
 * The project tab answers what one job is spending on plant. This answers the
 * questions a company asks about a fleet, and they are different questions:
 * which machines are earning, which are standing, and which have been hired
 * long enough that buying was the cheaper answer.
 *
 * The idle machines are the point of the page, so they are not hidden behind a
 * filter. An excavator nobody has charged to a job in four months is the most
 * interesting row here, and a table that only listed the busy ones would answer
 * a question nobody asked.
 */

export interface FleetTableRow {
  itemId: string
  name: string
  category: string | null
  ownershipLabel: string
  vendorName: string | null
  active: boolean
  loadedHourlyCost: number
  jobCount: number
  rentalCost: number
  operatingCost: number
  standbyCost: number
  cost: number
  operatingHours: number
  standbyHours: number
  hiredHours: number
  standbyShare: number
  utilization: number
  issues: string[]
  jobs: { projectId: string; projectNumber: string; projectName: string; cost: number }[]
}

const FILTERS = [
  { id: 'all', label: 'Every machine' },
  { id: 'working', label: 'On a job' },
  { id: 'idle', label: 'On no job' },
  { id: 'standing', label: 'Standing more than a quarter' },
] as const

export function FleetTable({ rows }: { rows: FleetTableRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [category, setCategory] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const categories = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter((name): name is string => Boolean(name)))].sort(),
    [rows],
  )

  const shown = rows.filter((row) => {
    if (category !== 'all' && row.category !== category) return false
    if (filter === 'working') return row.jobCount > 0
    if (filter === 'idle') return row.jobCount === 0 && row.active
    if (filter === 'standing') return row.cost > 0 && row.standbyShare > 0.25
    return true
  })

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="◦"
        title="No machines on the equipment list yet"
        description="Add what the company owns and hires, with the rates each one is quoted at. Once jobs start charging machines, this page says which are earning and which are standing."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <select
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
          className="field h-8 text-xs"
          aria-label="Filter by what the machine is doing"
        >
          {FILTERS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        {categories.length > 1 && (
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="field h-8 text-xs"
            aria-label="Filter by category"
          >
            <option value="all">Every category</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          {shown.length} of {rows.length}
        </span>
      </div>

      <div className="card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Ownership</th>
                <th className="num">On jobs</th>
                <th className="num">Hired hours</th>
                <th className="num">Hours run</th>
                <th className="num">Used</th>
                <th className="num">Hire</th>
                <th className="num">Fuel and wear</th>
                <th className="num">Standby</th>
                <th className="num">Cost across the fleet</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <Fragment key={row.itemId}>
                  <tr
                    onClick={() => setExpanded(expanded === row.itemId ? null : row.itemId)}
                    style={{ cursor: row.jobs.length > 0 ? 'pointer' : 'default', opacity: row.active ? 1 : 0.55 }}
                  >
                    <td>
                      <span className="font-medium">{row.name}</span>
                      {row.category && (
                        <span className="ml-1.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                          {row.category}
                        </span>
                      )}
                      {!row.active && (
                        <span
                          className="ml-1.5 pill"
                          style={{ background: 'var(--surface-inset)', color: 'var(--text-subtle)' }}
                        >
                          Out of use
                        </span>
                      )}
                      <div className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                        {money(row.loadedHourlyCost, { cents: true })} an hour, all in
                        {row.vendorName ? ` · ${row.vendorName}` : ''}
                      </div>
                      {row.issues.length > 0 && (
                        <div className="wrap mt-0.5 text-[11px]" style={{ color: 'var(--caution)' }}>
                          {row.issues.join(' ')}
                        </div>
                      )}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.ownershipLabel}
                    </td>
                    <td className="num">
                      {row.jobCount === 0 ? (
                        <Pill tone={row.active ? 'caution' : 'neutral'}>None</Pill>
                      ) : (
                        row.jobCount
                      )}
                    </td>
                    <td className="num">{row.hiredHours ? hours(row.hiredHours) : '-'}</td>
                    <td className="num">{row.operatingHours ? hours(row.operatingHours) : '-'}</td>
                    <td
                      className="num"
                      style={{
                        color:
                          row.hiredHours > 0 && row.utilization < 0.5
                            ? 'var(--caution)'
                            : row.utilization > 1
                              ? 'var(--adverse)'
                              : undefined,
                      }}
                      title={
                        row.utilization > 1
                          ? 'Run for more hours than the hire covers, which is either a keying slip or an under-recorded hire.'
                          : 'Hours run against the hours the hire bought.'
                      }
                    >
                      {row.hiredHours ? percent(row.utilization) : '-'}
                    </td>
                    <td className="num">{money(row.rentalCost)}</td>
                    <td className="num">{money(row.operatingCost)}</td>
                    <td className="num" style={{ color: row.standbyShare > 0.25 ? 'var(--caution)' : undefined }}>
                      {money(row.standbyCost)}
                      {row.standbyShare > 0.25 && (
                        <span className="ml-1 text-[10px]">{percent(row.standbyShare)}</span>
                      )}
                    </td>
                    <td className="num font-semibold">{money(row.cost)}</td>
                  </tr>
                  {expanded === row.itemId &&
                    row.jobs.map((job) => (
                      <tr key={`${row.itemId}-${job.projectId}`} style={{ background: 'var(--surface-inset)' }}>
                        <td colSpan={9} className="text-xs">
                          <Link
                            href={`/projects/${job.projectId}/labor`}
                            className="hover:underline"
                            style={{ color: 'var(--accent)' }}
                          >
                            {job.projectNumber} {job.projectName}
                          </Link>
                        </td>
                        <td className="num text-xs">{money(job.cost)}</td>
                      </tr>
                    ))}
                </Fragment>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ color: 'var(--text-subtle)' }}>
                    Nothing matches these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs no-print" style={{ color: 'var(--text-subtle)' }}>
        Click a machine to see which jobs are carrying it. Only jobs still running are counted, because the question
        here is what the fleet is doing now.
      </p>
    </div>
  )
}
