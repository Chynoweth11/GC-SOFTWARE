import Link from 'next/link'
import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { searchAudit } from '@/lib/audit'
import { titleize } from '@/lib/format'
import { EmptyState, InfoNote, Section } from '@/components/ui'
import { AuditFilters } from '@/components/admin/audit-filters'

export const metadata = { title: 'Audit history' }

const ACTION_TONES: Record<string, { bg: string; fg: string }> = {
  CREATE: { bg: 'var(--favorable-soft)', fg: 'var(--favorable)' },
  UPDATE: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  DELETE: { bg: 'var(--adverse-soft)', fg: 'var(--adverse)' },
  ARCHIVE: { bg: 'var(--caution-soft)', fg: 'var(--caution)' },
  RESTORE: { bg: 'var(--favorable-soft)', fg: 'var(--favorable)' },
  APPROVE: { bg: 'var(--favorable-soft)', fg: 'var(--favorable)' },
  REJECT: { bg: 'var(--adverse-soft)', fg: 'var(--adverse)' },
  LOCK: { bg: 'var(--surface-inset)', fg: 'var(--text-muted)' },
}

function ActionTag({ action }: { action: string }) {
  const tone = ACTION_TONES[action] ?? { bg: 'var(--surface-inset)', fg: 'var(--text-muted)' }
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em]"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {action.replace(/_/g, ' ')}
    </span>
  )
}

/** Long identifiers and values are clipped in the cell but kept in the title. */
function Value({ text, muted }: { text: string | null; muted?: boolean }) {
  if (text == null || text === '') return <span style={{ color: 'var(--text-subtle)' }}>none</span>
  return (
    <span className="block max-w-[15rem] truncate" title={text} style={{ color: muted ? 'var(--text-muted)' : 'var(--text)' }}>
      {text}
    </span>
  )
}

const TIMESTAMP = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
})

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requireUser()
  if (!can(user.role, 'view:audit')) forbidden()

  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    const first = Array.isArray(value) ? value[0] : value
    return first && first.length > 0 ? first : undefined
  }

  const parseDate = (value: string | undefined) => {
    if (!value) return undefined
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? undefined : parsed
  }

  const page = Number(one('page') ?? 1) || 1
  const data = await searchAudit(user.companyId, {
    entity: one('entity'),
    action: one('action'),
    userId: one('user'),
    search: one('q'),
    from: parseDate(one('from')),
    to: parseDate(one('to')),
    page,
  })

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value && key !== 'page') query.set(key, value)
  }
  const pageHref = (target: number) => {
    const next = new URLSearchParams(query)
    next.set('page', String(target))
    return `/admin/audit?${next.toString()}`
  }

  const first = (data.page - 1) * data.pageSize + 1
  const last = Math.min(data.page * data.pageSize, data.total)

  return (
    <div className="space-y-6">
      <Section
        title="Audit history"
        description="Every change made in this company, in the order it happened"
        actions={
          <Link href={`/api/export/audit?${query.toString()}`} className="btn btn-secondary text-xs">
            Export to Excel
          </Link>
        }
      >
        <InfoNote>
          This history is permanent. Records are added and never changed: the database rejects any attempt to edit or delete
          an audit record, and so does the application. Administrators can read and export it; nobody can alter it.
        </InfoNote>

        <div className="mt-3">
          <AuditFilters entities={data.entities} actions={data.actions} users={data.users} />
        </div>

        {data.total === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="Nothing matches these filters"
              description="Change the filters above, or clear them to see the whole history."
            />
          </div>
        ) : (
          <>
            <div className="card-flush mt-3">
              <div className="table-wrap" style={{ maxHeight: '42rem', overflowY: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 155 }}>When (UTC)</th>
                      <th>Who</th>
                      <th>Role</th>
                      <th>Action</th>
                      <th>Record type</th>
                      <th>Record</th>
                      <th>Field</th>
                      <th>Changed from</th>
                      <th>Changed to</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="tnum whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {TIMESTAMP.format(row.createdAt)}
                        </td>
                        <td className="font-medium">
                          <Value text={row.userName ?? 'System'} />
                          {row.userEmail && (
                            <span className="block text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                              {row.userEmail}
                            </span>
                          )}
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{row.userRole ? titleize(row.userRole) : 'none'}</td>
                        <td>
                          <ActionTag action={row.action} />
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{row.entity}</td>
                        <td>
                          <Value text={row.entityLabel ?? row.entityId} />
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          <Value text={row.field} muted />
                        </td>
                        <td>
                          <Value text={row.oldValue} muted />
                        </td>
                        <td>
                          <Value text={row.newValue} />
                        </td>
                        <td>
                          <Value text={row.summary} muted />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span className="tnum">
                Showing {first.toLocaleString('en-US')} to {last.toLocaleString('en-US')} of{' '}
                {data.total.toLocaleString('en-US')} records
              </span>
              {data.pageCount > 1 && (
                <div className="flex items-center gap-2">
                  {data.page > 1 ? (
                    <Link href={pageHref(data.page - 1)} className="btn btn-ghost text-xs">
                      Previous
                    </Link>
                  ) : (
                    <span className="btn btn-ghost text-xs opacity-40">Previous</span>
                  )}
                  <span className="tnum">
                    Page {data.page} of {data.pageCount}
                  </span>
                  {data.page < data.pageCount ? (
                    <Link href={pageHref(data.page + 1)} className="btn btn-ghost text-xs">
                      Next
                    </Link>
                  ) : (
                    <span className="btn btn-ghost text-xs opacity-40">Next</span>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
