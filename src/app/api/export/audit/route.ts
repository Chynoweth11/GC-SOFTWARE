import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { searchAudit } from '@/lib/audit'
import { buildWorkbook, workbookResponse } from '@/lib/excel'
import { recordAudit } from '@/lib/audit'

/**
 * The audit history as a workbook.
 *
 * Taking a copy is itself a change worth recording, so the export writes its own
 * audit entry naming who took it and how many records they took.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!can(user.role, 'view:audit')) return new Response('Your role cannot read the audit history', { status: 403 })

  const params = request.nextUrl.searchParams
  const one = (key: string) => params.get(key) || undefined
  const parseDate = (value: string | undefined) => {
    if (!value) return undefined
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? undefined : parsed
  }

  const data = await searchAudit(user.companyId, {
    entity: one('entity'),
    action: one('action'),
    userId: one('user'),
    search: one('q'),
    from: parseDate(one('from')),
    to: parseDate(one('to')),
    page: 1,
    pageSize: 500,
  })

  const asOf = new Date().toISOString().slice(0, 10)

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'AuditLog',
    entityId: 'export',
    entityLabel: 'Audit history',
    action: 'EXPORT',
    summary: `Exported ${data.rows.length} audit records`,
  })

  const workbook = buildWorkbook(
    [
      {
        name: 'Audit history',
        notes: [
          `Audit history for ${user.companyName}`,
          `Exported ${asOf} by ${user.name}. ${data.total} records matched; the newest ${data.rows.length} are listed.`,
          'This history is permanent and cannot be edited or deleted.',
        ],
        columns: [
          { header: 'When (UTC)', key: 'when', width: 22 },
          { header: 'Person', key: 'who', width: 22 },
          { header: 'Email', key: 'email', width: 26 },
          { header: 'Role', key: 'role', width: 18 },
          { header: 'Action', key: 'action', width: 16 },
          { header: 'Record type', key: 'entity', width: 18 },
          { header: 'Record', key: 'label', width: 30 },
          { header: 'Record id', key: 'entityId', width: 28 },
          { header: 'Field', key: 'field', width: 24 },
          { header: 'Changed from', key: 'oldValue', width: 26 },
          { header: 'Changed to', key: 'newValue', width: 26 },
          { header: 'Detail', key: 'summary', width: 46 },
        ],
        rows: data.rows.map((row) => ({
          when: row.createdAt.toISOString().replace('T', ' ').slice(0, 19),
          who: row.userName ?? 'System',
          email: row.userEmail ?? '',
          role: row.userRole ?? '',
          action: row.action,
          entity: row.entity,
          label: row.entityLabel ?? '',
          entityId: row.entityId,
          field: row.field ?? '',
          oldValue: row.oldValue ?? '',
          newValue: row.newValue ?? '',
          summary: row.summary ?? '',
        })),
      },
    ],
    { title: 'Audit history', company: user.companyName },
  )

  return workbookResponse(workbook, `constructx-audit-history-${asOf}.xlsx`)
}
