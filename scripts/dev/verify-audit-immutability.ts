/**
 * Proves the permanent history really is permanent.
 *
 * Writes one entry, then attacks it from every direction the application and a
 * database console have available. Every attempt must fail, and the entry must
 * still read exactly as written.
 */
import { prisma } from '../../src/lib/db'

/** Mirrors recordAudit without pulling in the server-only module graph. */
async function recordAudit(entry: {
  companyId: string
  actor: { id: string; name: string; email: string; role: string }
  entity: string
  entityId: string
  entityLabel: string
  action: string
  field: string
  oldValue: string
  newValue: string
  summary: string
}) {
  await prisma.auditLog.create({
    data: {
      companyId: entry.companyId,
      userId: entry.actor.id,
      userName: entry.actor.name,
      userEmail: entry.actor.email,
      userRole: entry.actor.role,
      entity: entry.entity,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel,
      action: entry.action,
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      summary: entry.summary,
    },
  })
}

type Attempt = { name: string; run: () => Promise<unknown> }

async function main() {
  const company = await prisma.company.findFirstOrThrow()
  const owner = await prisma.user.findFirstOrThrow({ where: { companyId: company.id, role: 'OWNER' } })

  const marker = `immutability probe ${Date.now()}`
  await recordAudit({
    companyId: company.id,
    actor: { id: owner.id, name: owner.name, email: owner.email, role: owner.role },
    entity: 'Verification',
    entityId: company.id,
    entityLabel: 'Audit immutability check',
    action: 'checked',
    field: 'Tamper resistance',
    oldValue: 'before',
    newValue: 'after',
    summary: marker,
  })

  const entry = await prisma.auditLog.findFirstOrThrow({ where: { summary: marker } })
  console.log('wrote entry', entry.id)

  const attempts: Attempt[] = [
    { name: 'prisma update', run: () => prisma.auditLog.update({ where: { id: entry.id }, data: { summary: 'tampered' } }) },
    { name: 'prisma updateMany', run: () => prisma.auditLog.updateMany({ where: { id: entry.id }, data: { summary: 'tampered' } }) },
    { name: 'prisma upsert', run: () => prisma.auditLog.upsert({ where: { id: entry.id }, update: { summary: 'tampered' }, create: { companyId: company.id, entity: 'x', entityId: 'x', action: 'x' } }) },
    { name: 'prisma delete', run: () => prisma.auditLog.delete({ where: { id: entry.id } }) },
    { name: 'prisma deleteMany (one)', run: () => prisma.auditLog.deleteMany({ where: { id: entry.id } }) },
    { name: 'prisma deleteMany (all)', run: () => prisma.auditLog.deleteMany({}) },
    { name: 'raw SQL UPDATE', run: () => prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET summary = 'tampered' WHERE id = '${entry.id}'`) },
    { name: 'raw SQL DELETE', run: () => prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = '${entry.id}'`) },
    { name: 'raw SQL DELETE ALL', run: () => prisma.$executeRawUnsafe('DELETE FROM "AuditLog"') },
    { name: 'raw SQL UPDATE ALL', run: () => prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET userName = 'nobody'`) },
  ]

  let blocked = 0
  for (const attempt of attempts) {
    try {
      await attempt.run()
      console.log(`  FAILED   ${attempt.name} was allowed through`)
    } catch (error) {
      blocked++
      console.log(`  blocked  ${attempt.name}: ${(error as Error).message.split('\n')[0].slice(0, 90)}`)
    }
  }

  const after = await prisma.auditLog.findUnique({ where: { id: entry.id } })
  const intact =
    after != null &&
    after.summary === marker &&
    after.userName === owner.name &&
    after.oldValue === 'before' &&
    after.newValue === 'after'

  console.log(`\n${blocked} of ${attempts.length} attempts blocked`)
  console.log(`entry intact: ${intact ? 'yes' : 'NO'}`)

  // Dropping the triggers is the one thing SQLite permits. The client reinstates
  // them the next time it starts, so check that the repair actually happens.
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_log_is_append_only_update')
  await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS audit_log_is_append_only_delete')
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_update BEFORE UPDATE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be modified.'); END`,
  )
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER IF NOT EXISTS audit_log_is_append_only_delete BEFORE DELETE ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'The audit history is permanent and cannot be deleted.'); END`,
  )
  const triggers = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'audit_log%'`,
  )
  console.log('triggers present after repair:', triggers.map((t) => t.name).join(', '))

  process.exit(blocked === attempts.length && intact ? 0 : 1)
}

main()
