import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getProjectBundle } from '@/lib/queries/project'
import { prisma } from '@/lib/db'
import { auditTrail } from '@/lib/audit'
import { date, dateInput, money, percent, titleize } from '@/lib/format'
import Link from 'next/link'
import { DataList, EmptyState, InfoNote, Section, StatusPill } from '@/components/ui'
import { ProjectSettingsForm } from '@/components/project/project-settings-form'
import { updateProject, createSnapshot, setProjectArchived, deleteProject } from './actions'
import { ProjectDangerZone } from '@/components/project/project-danger-zone'

export default async function ProjectSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getProjectBundle(id, user.companyId)
  if (!bundle) notFound()

  const { project, financials: f } = bundle
  const canEdit = can(user.role, 'edit:project_setup')

  const [clients, managers, snapshots, trail, counts] = await Promise.all([
    prisma.client.findMany({ where: { companyId: user.companyId }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { name: 'asc' } }),
    prisma.projectSnapshot.findMany({ where: { projectId: id }, orderBy: { asOf: 'desc' } }),
    auditTrail(user.companyId, 'Project', id),
    prisma.project.findUniqueOrThrow({
      where: { id },
      select: { _count: { select: { costTx: true, ownerBillings: true, commitments: true, changeOrders: true, subInvoices: true } } },
    }),
  ])
  const historyCount = Object.values(counts._count).reduce((total, n) => total + n, 0)

  return (
    <div className="space-y-6">
      <Section title="Project setup" description="Every other tab keys off these values">
        {canEdit ? (
          <ProjectSettingsForm
            action={updateProject}
            project={{
              id: project.id,
              number: project.number,
              name: project.name,
              clientId: project.clientId,
              address: project.address,
              city: project.city,
              state: project.state,
              projectType: project.projectType,
              deliveryMethod: project.deliveryMethod,
              architect: project.architect,
              pmUserId: project.pmUserId,
              superintendent: project.superintendent,
              status: project.status,
              noticeToProceed: dateInput(project.noticeToProceed),
              contractStart: dateInput(project.contractStart),
              contractCompletion: dateInput(project.contractCompletion),
              forecastCompletion: dateInput(project.forecastCompletion),
              dataDate: dateInput(project.dataDate),
              originalContractSum: project.originalContractSum,
              ownerRetentionPct: project.ownerRetentionPct,
              defaultSubRetentionPct: project.defaultSubRetentionPct,
              targetMarginPct: project.targetMarginPct,
              laborBurdenPct: project.laborBurdenPct,
              overheadPct: project.overheadPct,
              workDaysPerWeek: project.workDaysPerWeek,
              safetyScore: project.safetyScore,
              qualityScore: project.qualityScore,
              clientSatScore: project.clientSatScore,
              notes: project.notes,
            }}
            clients={clients.map((c) => ({ id: c.id, label: c.name }))}
            managers={managers.map((m) => ({ id: m.id, label: m.name }))}
          />
        ) : (
          <div className="card p-4">
            <DataList
              columns={3}
              items={[
                { label: 'Job number', value: project.number },
                { label: 'Client', value: project.client?.name ?? '-' },
                { label: 'Status', value: <StatusPill status={project.status} /> },
                { label: 'Contract start', value: date(project.contractStart) },
                { label: 'Contract completion', value: date(project.contractCompletion) },
                { label: 'Forecast completion', value: date(project.forecastCompletion) },
                { label: 'Original contract sum', value: money(project.originalContractSum) },
                { label: 'Owner retention', value: percent(project.ownerRetentionPct, 1) },
                { label: 'Target margin', value: percent(project.targetMarginPct, 1) },
              ]}
            />
          </div>
        )}
      </Section>

      <Section
        title="Financial snapshots"
        description="Point-in-time captures of the whole project position, taken automatically at every forecast lock"
        actions={
          canEdit ? (
            <form action={createSnapshot}>
              <input type="hidden" name="projectId" value={project.id} />
              <button type="submit" className="btn btn-secondary text-xs">
                Capture snapshot now
              </button>
            </form>
          ) : undefined
        }
      >
        {snapshots.length === 0 ? (
          <EmptyState title="No snapshots yet" description="Locking a forecast period captures one automatically." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>As of</th>
                    <th>Label</th>
                    <th className="num">Contract</th>
                    <th className="num">Budget</th>
                    <th className="num">Cost to date</th>
                    <th className="num">Forecast cost</th>
                    <th className="num">Forecast profit</th>
                    <th className="num">Margin</th>
                    <th>Captured</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => {
                    let payload: Record<string, unknown> = {}
                    try {
                      payload = JSON.parse(s.payload)
                    } catch {
                      payload = {}
                    }
                    const contract = (payload.contract as { currentContract?: number })?.currentContract
                    return (
                      <tr key={s.id}>
                        <td className="font-medium">{date(s.asOf)}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{s.label ?? '-'}</td>
                        <td className="num">{contract == null ? '-' : money(contract)}</td>
                        <td className="num">{payload.currentBudget == null ? '-' : money(payload.currentBudget as number)}</td>
                        <td className="num">{payload.totalCostToDate == null ? '-' : money(payload.totalCostToDate as number)}</td>
                        <td className="num">{payload.forecastCost == null ? '-' : money(payload.forecastCost as number)}</td>
                        <td className="num">{payload.forecastProfit == null ? '-' : money(payload.forecastProfit as number)}</td>
                        <td className="num">{payload.forecastMargin == null ? '-' : percent(payload.forecastMargin as number)}</td>
                        <td style={{ color: 'var(--text-subtle)' }}>{date(s.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Position today</td>
                    <td className="num">{money(f.contract.currentContract)}</td>
                    <td className="num">{money(f.currentBudget)}</td>
                    <td className="num">{money(f.totalCostToDate)}</td>
                    <td className="num">{money(f.forecastCost)}</td>
                    <td className="num">{money(f.forecastProfit)}</td>
                    <td className="num">{percent(f.forecastMargin)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </Section>

      {canEdit && (
        <Section
          title="Backup"
          description="The whole project as one restorable file: budgets, commitments, costs, change orders, billings, forecasts and quantities"
          actions={
            <a href={`/api/backup/project/${project.id}`} className="btn btn-secondary text-xs">
              Download backup
            </a>
          }
        >
          <InfoNote>
            The file carries stored values only. Every derived figure is recalculated on restore by the same engine this page
            uses, so a restored project can never disagree with a live one. Restoring is done from{' '}
            <Link href="/admin/restore" className="underline">
              Settings → Backup and restore
            </Link>
            , and always creates a new project rather than overwriting one.
          </InfoNote>
        </Section>
      )}

      {canEdit && (
        <Section title="Closing this project" description="How a job is retired without losing anything">
          <ProjectDangerZone
            projectId={project.id}
            projectNumber={project.number}
            archived={project.status === 'CLOSED'}
            canDelete={can(user.role, 'delete:records')}
            historyCount={historyCount}
            setArchived={setProjectArchived}
            remove={deleteProject}
          />
        </Section>
      )}

      <Section title="Change history" description="Every setup change to this project, with who made it">
        {trail.length === 0 ? (
          <EmptyState title="No changes recorded yet" description="Edits to the project setup will be listed here." />
        ) : (
          <div className="card-flush">
            <div className="table-wrap" style={{ maxHeight: '24rem', overflowY: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Field</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {trail.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{date(entry.createdAt)}</td>
                      <td>{entry.userName ?? 'System'}</td>
                      <td>{titleize(entry.action)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{entry.field ?? '-'}</td>
                      <td style={{ color: 'var(--text-subtle)' }}>{entry.oldValue ?? '-'}</td>
                      <td style={{ color: 'var(--text-subtle)' }}>{entry.newValue ?? '-'}</td>
                      <td className="max-w-[24rem] truncate" title={entry.summary ?? ''}>
                        {entry.summary ?? '-'}
                      </td>
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
