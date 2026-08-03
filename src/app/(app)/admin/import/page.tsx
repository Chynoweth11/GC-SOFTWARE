import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { forbidden } from 'next/navigation'
import { prisma } from '@/lib/db'
import { date } from '@/lib/format'
import { EmptyState, Section, InfoNote } from '@/components/ui'
import { ImportForm } from '@/components/admin/import-form'
import { importCostTransactions } from './actions'

export const metadata = { title: 'Import' }

export default async function ImportPage() {
  const user = await requireUser()
  if (!can(user.role, 'import:data')) forbidden()

  const [projects, recentImports, uncoded] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: user.companyId },
      select: { id: true, number: true, name: true },
      orderBy: { number: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: { companyId: user.companyId, action: 'IMPORT' },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.costTransaction.groupBy({
      by: ['projectId'],
      where: { project: { companyId: user.companyId }, needsCoding: true, deletedAt: null },
      _count: true,
    }),
  ])

  const projectById = new Map(projects.map((p) => [p.id, p]))

  return (
    <div className="space-y-6">
      <Section
        title="Import accounting transactions"
        description="Load a cost export from your accounting system. Rows already in the ledger are skipped, and anything that cannot be coded is flagged rather than dropped."
      >
        <InfoNote>
          The first row must be headers. Required: <strong>date</strong>, <strong>cost code</strong>, <strong>description</strong>,{' '}
          <strong>amount</strong>. Optional: <strong>vendor</strong>, <strong>reference</strong>, <strong>type</strong> (actual or accrual),{' '}
          <strong>hours</strong>. Column order does not matter and header case is ignored.
        </InfoNote>

        <div className="mt-3">
          <ImportForm
            projects={projects.map((p) => ({ id: p.id, label: `${p.number} — ${p.name}` }))}
            action={importCostTransactions}
          />
        </div>
      </Section>

      {uncoded.length > 0 && (
        <Section title="Transactions awaiting a cost code" description="Imported cost that could not be matched to a code">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th className="num">Transactions needing coding</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {uncoded.map((row) => (
                    <tr key={row.projectId}>
                      <td className="font-medium">
                        {projectById.get(row.projectId)?.number} — {projectById.get(row.projectId)?.name}
                      </td>
                      <td className="num">{row._count}</td>
                      <td>
                        <a href={`/projects/${row.projectId}/costs`} className="hover:underline" style={{ color: 'var(--accent)' }}>
                          Code them →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      <Section title="Import history">
        {recentImports.length === 0 ? (
          <EmptyState title="No imports yet" description="Every import is recorded here with its outcome." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Project</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {recentImports.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{date(entry.createdAt)}</td>
                      <td>{entry.user?.name ?? 'System'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        {projectById.get(entry.entityId)?.number ?? entry.entityId}
                      </td>
                      <td>{entry.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}
