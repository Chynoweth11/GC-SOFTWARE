import 'server-only'
import { prisma } from './db'
import type { Prisma as PrismaTypes } from '@/generated/prisma/client'

/**
 * The permanent history of every change.
 *
 * Records are appended and never touched again. The database rejects UPDATE and
 * DELETE on the table, and the Prisma client refuses those operations too, so
 * there is no route through this module or around it that can rewrite the past.
 *
 * The author and the record's name are copied into each row rather than joined,
 * because a history that reads "unknown user changed record cmsc..." once a user
 * or a project has been removed is not a history worth keeping.
 */

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'APPROVE'
  | 'REJECT'
  | 'LOCK'
  | 'UNLOCK'
  | 'IMPORT'
  | 'EXPORT'
  | 'AWARD'
  | 'CONVERT'
  | 'PAYMENT'
  | 'TRANSFER'

export interface AuditActor {
  id: string
  name?: string | null
  email?: string | null
  role?: string | null
  companyId: string
}

export interface AuditEntry {
  companyId: string
  userId?: string | null
  /** Copied onto the record so it survives the user being removed. */
  actor?: { name?: string | null; email?: string | null; role?: string | null }
  entity: string
  entityId: string
  /** What the record was called at the time, for example "26-001 Riverside". */
  entityLabel?: string | null
  action: AuditAction | string
  field?: string | null
  oldValue?: string | number | boolean | Date | null
  newValue?: string | number | boolean | Date | null
  summary?: string
}

function asText(value: AuditEntry['oldValue']): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

/**
 * Appends one audit record.
 *
 * Never throws into the caller: an audit failure must not roll back the change
 * the user actually asked for. It is logged loudly instead, so a gap in the
 * history is visible rather than silent.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: entry.userId ?? null,
        userName: entry.actor?.name ?? null,
        userEmail: entry.actor?.email ?? null,
        userRole: entry.actor?.role ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        entityLabel: entry.entityLabel ?? null,
        action: entry.action,
        field: entry.field ?? null,
        oldValue: asText(entry.oldValue),
        newValue: asText(entry.newValue),
        summary: entry.summary ?? null,
      },
    })
  } catch (error) {
    console.error('Audit write failed', { entity: entry.entity, entityId: entry.entityId, error })
  }
}

/**
 * Appends one record per field that actually changed.
 *
 * Comparing before and after here rather than at each call site is what keeps
 * the history at field level: "target margin 18% to 15%" instead of the far less
 * useful "project updated".
 */
export async function recordFieldChanges({
  actor,
  entity,
  entityId,
  entityLabel,
  before,
  after,
  labels = {},
  action = 'UPDATE',
}: {
  actor: AuditActor
  entity: string
  entityId: string
  entityLabel?: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  /** Field name mapped to the wording a person would recognise. */
  labels?: Record<string, string>
  action?: AuditAction | string
}): Promise<number> {
  const normalise = (value: unknown): string | null => {
    if (value == null) return null
    if (value instanceof Date) return value.toISOString()
    if (typeof value === 'number') return String(Number(value.toFixed(6)))
    return String(value)
  }

  let written = 0
  for (const key of Object.keys(after)) {
    const from = normalise(before[key])
    const to = normalise(after[key])
    if (from === to) continue
    written++
    await recordAudit({
      companyId: actor.companyId,
      userId: actor.id,
      actor,
      entity,
      entityId,
      entityLabel,
      action,
      field: labels[key] ?? key,
      oldValue: from,
      newValue: to,
      summary: `${labels[key] ?? key} changed`,
    })
  }
  return written
}

// ── Reading ───────────────────────────────────────────────────────────────

export async function auditTrail(companyId: string, entity: string, entityId: string, take = 100) {
  return prisma.auditLog.findMany({
    where: { companyId, entity, entityId },
    orderBy: { createdAt: 'desc' },
    take,
  })
}

export async function recentActivity(companyId: string, take = 50) {
  return prisma.auditLog.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take,
  })
}

export interface AuditFilter {
  entity?: string
  action?: string
  userId?: string
  search?: string
  from?: Date
  to?: Date
  page?: number
  pageSize?: number
}

export interface AuditPage {
  rows: Awaited<ReturnType<typeof recentActivity>>
  total: number
  page: number
  pageSize: number
  pageCount: number
  entities: string[]
  actions: string[]
  users: { id: string; label: string }[]
}

/** The full history, filtered and paged, for the administrator's view. */
export async function searchAudit(companyId: string, filter: AuditFilter = {}): Promise<AuditPage> {
  const pageSize = Math.min(Math.max(filter.pageSize ?? 100, 10), 500)
  const page = Math.max(filter.page ?? 1, 1)

  const where: PrismaTypes.AuditLogWhereInput = { companyId }
  if (filter.entity) where.entity = filter.entity
  if (filter.action) where.action = filter.action
  if (filter.userId) where.userId = filter.userId
  if (filter.from || filter.to) {
    where.createdAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) }
  }
  if (filter.search) {
    const contains = filter.search
    where.OR = [
      { summary: { contains } },
      { entityLabel: { contains } },
      { field: { contains } },
      { oldValue: { contains } },
      { newValue: { contains } },
      { userName: { contains } },
      { entityId: { contains } },
    ]
  }

  const [rows, total, entityGroups, actionGroups, users] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['entity'], where: { companyId }, _count: true }),
    prisma.auditLog.groupBy({ by: ['action'], where: { companyId }, _count: true }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    entities: entityGroups.map((g) => g.entity).sort(),
    actions: actionGroups.map((g) => g.action).sort(),
    users: users.map((u) => ({ id: u.id, label: u.name })),
  }
}
