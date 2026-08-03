import 'server-only'
import { prisma } from './db'

export interface AuditEntry {
  companyId: string
  userId?: string | null
  entity: string
  entityId: string
  action: string
  field?: string | null
  oldValue?: string | number | null
  newValue?: string | number | null
  summary?: string
}

/**
 * Writes an audit record. Never throws into the caller — an audit failure must
 * not roll back the financial change the user actually asked for, but it does
 * get logged so the gap is visible.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: entry.userId ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        field: entry.field ?? null,
        oldValue: entry.oldValue == null ? null : String(entry.oldValue),
        newValue: entry.newValue == null ? null : String(entry.newValue),
        summary: entry.summary ?? null,
      },
    })
  } catch (error) {
    console.error('Audit write failed', { entity: entry.entity, entityId: entry.entityId, error })
  }
}

export async function auditTrail(companyId: string, entity: string, entityId: string) {
  return prisma.auditLog.findMany({
    where: { companyId, entity, entityId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}

export async function recentActivity(companyId: string, take = 50) {
  return prisma.auditLog.findMany({
    where: { companyId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take,
  })
}
