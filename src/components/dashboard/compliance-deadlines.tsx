import Link from 'next/link'
import { Pill } from '@/components/ui'
import { date } from '@/lib/format'

/**
 * Every labor compliance filing owed across the portfolio, worst first.
 *
 * The point of this panel is the job nobody opened this week. A weekly
 * certified payroll is easy to keep on top of while somebody is looking at the
 * project; it is the third job, the one that has been running quietly since
 * March, where the filings stop and nobody notices until a payment application
 * is held.
 */

export type ComplianceStatus = 'CURRENT' | 'DUE_SOON' | 'DUE_TODAY' | 'OVERDUE' | 'CLOSED'

export interface DeadlineRow {
  key: string
  projectId: string
  projectNumber: string
  projectName: string
  title: string
  agency: string | null
  status: ComplianceStatus
  summary: string
  nextDueDate: string | null
  daysUntilDue: number | null
  responsibleName: string | null
}

const TONE: Record<ComplianceStatus, 'favorable' | 'caution' | 'adverse' | 'neutral'> = {
  CURRENT: 'favorable',
  DUE_SOON: 'caution',
  DUE_TODAY: 'caution',
  OVERDUE: 'adverse',
  CLOSED: 'neutral',
}

const LABEL: Record<ComplianceStatus, string> = {
  CURRENT: 'Up to date',
  DUE_SOON: 'Due soon',
  DUE_TODAY: 'Due today',
  OVERDUE: 'Overdue',
  CLOSED: 'Nothing outstanding',
}

export function ComplianceDeadlines({
  rows,
  overdue,
  dueSoon,
  calendarHref,
}: {
  rows: DeadlineRow[]
  overdue: number
  dueSoon: number
  calendarHref: string
}) {
  // Anything outstanding, then a few of the ones that are simply next, so the
  // panel reads as a list of work rather than a list of alarms.
  const outstanding = rows.filter((row) => row.status !== 'CURRENT' && row.status !== 'CLOSED')
  const upcoming = rows.filter((row) => row.status === 'CURRENT').slice(0, Math.max(0, 6 - outstanding.length))
  const shown = [...outstanding, ...upcoming]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={overdue > 0 ? 'adverse' : 'favorable'} dot>
          {overdue > 0 ? `${overdue} overdue` : 'Nothing overdue'}
        </Pill>
        {dueSoon > 0 && <Pill tone="caution">{dueSoon} due shortly</Pill>}
        <a href={calendarHref} className="ml-auto btn btn-ghost text-xs no-print">
          Subscribe in a calendar
        </a>
      </div>

      <div className="card-flush">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Project</th>
                <th>Filing</th>
                <th>Next due</th>
                <th>Where it stands</th>
                <th>Responsible</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.key}>
                  <td>
                    <Link href={`/projects/${row.projectId}/labor`} className="font-medium hover:underline">
                      {row.projectNumber}
                    </Link>
                    <span className="ml-1.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                      {row.projectName}
                    </span>
                  </td>
                  <td>
                    {row.title}
                    {row.agency && (
                      <span className="ml-1.5 text-xs" style={{ color: 'var(--text-subtle)' }}>
                        {row.agency}
                      </span>
                    )}
                  </td>
                  <td>{row.nextDueDate ? date(row.nextDueDate) : 'Nothing outstanding'}</td>
                  <td className="wrap">
                    <Pill tone={TONE[row.status]} dot>
                      {LABEL[row.status]}
                    </Pill>
                    <span className="ml-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {row.summary}
                    </span>
                  </td>
                  <td style={{ color: row.responsibleName ? 'var(--text)' : 'var(--text-subtle)' }}>
                    {row.responsibleName ?? 'Nobody named'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {rows.length > shown.length && (
        <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
          {rows.length - shown.length} more filings are on schedule and not shown.
        </p>
      )}
    </div>
  )
}
