import Link from 'next/link'
import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { date } from '@/lib/format'
import { EmptyState, InfoNote, Section } from '@/components/ui'
import { RestoreForm } from '@/components/admin/restore-form'
import { restoreFromBackup } from './actions'

export const metadata = { title: 'Backup and restore' }

export default async function RestorePage() {
  const user = await requireUser()
  if (!can(user.role, 'edit:project_setup')) forbidden()

  const [projects, restores] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: user.companyId },
      select: { id: true, number: true, name: true, updatedAt: true },
      orderBy: { number: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: { companyId: user.companyId, action: 'RESTORE' },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ])

  return (
    <div className="space-y-6">
      <Section
        title="Restore a project"
        description="Rebuild a project from a backup file taken on this or another ConstructX installation"
      >
        <InfoNote>
          A backup holds stored values only: budgets, commitments, costs, change orders, billings, forecasts and quantities.
          Every derived figure, from percent complete to estimate at completion, is recalculated on restore by the same engine
          the live project uses, so a restored job cannot carry a stale number.
        </InfoNote>
        <div className="mt-3">
          <RestoreForm action={restoreFromBackup} />
        </div>
      </Section>

      <Section title="Take a backup" description="One file per project, downloadable from here or from the project's settings tab">
        {projects.length === 0 ? (
          <EmptyState title="No projects yet" description="Backups become available once a project exists." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Project</th>
                    <th>Last changed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id}>
                      <td>
                        <Link href={`/projects/${project.id}`} className="font-medium hover:underline" style={{ color: 'var(--accent)' }}>
                          {project.number}
                        </Link>
                      </td>
                      <td>{project.name}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{date(project.updatedAt)}</td>
                      <td className="num">
                        <a href={`/api/backup/project/${project.id}`} className="btn btn-secondary text-xs">
                          Download backup
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {restores.length > 0 && (
        <Section title="Restore history" description="Every project restored into this company">
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>By</th>
                    <th>What</th>
                  </tr>
                </thead>
                <tbody>
                  {restores.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{date(entry.createdAt)}</td>
                      <td>{entry.userName ?? 'System'}</td>
                      <td>{entry.summary ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}
