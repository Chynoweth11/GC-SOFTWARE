import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recentActivity } from '@/lib/audit'
import { date, percent, titleize } from '@/lib/format'
import { DataList, EmptyState, KpiGrid, Kpi, Section } from '@/components/ui'
import { CompanyForm } from '@/components/admin/company-form'
import { updateCompany } from './actions'

export const metadata = { title: 'Company settings' }

export default async function AdminCompanyPage() {
  const user = await requireUser()
  if (!can(user.role, 'edit:company_settings')) forbidden()
  const canEdit = can(user.role, 'edit:company_settings')

  const [company, counts, activity] = await Promise.all([
    prisma.company.findUniqueOrThrow({ where: { id: user.companyId } }),
    Promise.all([
      prisma.project.count({ where: { companyId: user.companyId } }),
      prisma.user.count({ where: { companyId: user.companyId, active: true } }),
      prisma.costCode.count({ where: { companyId: user.companyId, active: true } }),
      prisma.vendor.count({ where: { companyId: user.companyId } }),
      prisma.costTransaction.count({ where: { project: { companyId: user.companyId }, deletedAt: null } }),
      prisma.auditLog.count({ where: { companyId: user.companyId } }),
    ]),
    recentActivity(user.companyId, 40),
  ])

  const [projects, users, costCodes, vendors, transactions, auditEntries] = counts

  return (
    <div className="space-y-6">
      <Section title="At a glance">
        <KpiGrid cols={6}>
          <Kpi label="Projects" value={projects.toString()} />
          <Kpi label="Active users" value={users.toString()} />
          <Kpi label="Cost codes" value={costCodes.toString()} />
          <Kpi label="Vendors" value={vendors.toString()} />
          <Kpi label="Cost transactions" value={transactions.toLocaleString('en-US')} />
          <Kpi label="Audit records" value={auditEntries.toLocaleString('en-US')} />
        </KpiGrid>
      </Section>

      <Section title="Company defaults" description="New projects and estimates inherit these values">
        {canEdit ? (
          <CompanyForm
            action={updateCompany}
            company={{
              name: company.name,
              legalName: company.legalName,
              address: company.address,
              city: company.city,
              state: company.state,
              phone: company.phone,
              fiscalYearStartMonth: company.fiscalYearStartMonth,
              targetMarginPct: company.targetMarginPct,
              defaultRetentionPct: company.defaultRetentionPct,
              defaultLaborBurdenPct: company.defaultLaborBurdenPct,
              defaultOverheadPct: company.defaultOverheadPct,
            }}
          />
        ) : (
          <div className="card p-4">
            <DataList
              columns={3}
              items={[
                { label: 'Company', value: company.name },
                { label: 'Legal name', value: company.legalName ?? '-' },
                { label: 'Target margin', value: percent(company.targetMarginPct, 1) },
                { label: 'Default retention', value: percent(company.defaultRetentionPct, 1) },
                { label: 'Default labor burden', value: percent(company.defaultLaborBurdenPct, 1) },
                { label: 'Default overhead', value: percent(company.defaultOverheadPct, 1) },
              ]}
            />
          </div>
        )}
      </Section>

      <Section title="Recent activity" description="Every financial change, who made it and when">
        {activity.length === 0 ? (
          <EmptyState title="No activity recorded yet" />
        ) : (
          <div className="card-flush">
            <div className="table-wrap" style={{ maxHeight: '32rem', overflowY: 'auto' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Entity</th>
                    <th>Action</th>
                    <th>Field</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{date(entry.createdAt)}</td>
                      <td>{entry.userName ?? 'System'}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{entry.entity}</td>
                      <td>{titleize(entry.action)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{entry.field ?? '-'}</td>
                      <td className="max-w-[10rem] truncate" style={{ color: 'var(--text-subtle)' }}>
                        {entry.oldValue ?? '-'}
                      </td>
                      <td className="max-w-[10rem] truncate" style={{ color: 'var(--text-subtle)' }}>
                        {entry.newValue ?? '-'}
                      </td>
                      <td className="max-w-[30rem] truncate" title={entry.summary ?? ''}>
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
