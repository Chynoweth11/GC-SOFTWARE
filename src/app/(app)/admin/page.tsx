import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recentActivity } from '@/lib/audit'
import { date, percent, titleize } from '@/lib/format'
import { DataList, EmptyState, KpiGrid, Kpi, Section } from '@/components/ui'
import { CompanyForm } from '@/components/admin/company-form'
import { mailConfig } from '@/lib/mail'
import { ssoConfig } from '@/lib/sso'
import { storageConfig } from '@/lib/storage'
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

  /*
    Whether reminders can actually leave the building.

    Shown rather than assumed. An alerting feature that is quietly switched off
    is worse than one that is obviously switched off, and the only way anybody
    finds out which they have is if the page says so.
  */
  const mail = mailConfig()
  const digestScheduled = Boolean(process.env.CRON_SECRET)
  const sso = ssoConfig()
  const storage = storageConfig()

  const storedAttachments = await prisma.documentAttachment.count({
    where: { changeOrder: { project: { companyId: user.companyId } }, storageKey: { not: null } },
  })
  const referencedAttachments = await prisma.documentAttachment.count({
    where: { changeOrder: { project: { companyId: user.companyId } }, storageKey: null },
  })

  return (
    <div className="space-y-6">
      <Section title="At a glance">
        <KpiGrid cols={6}>
          <Kpi label="Projects" value={projects.toString()} />
          <Kpi label="Active users" value={users.toString()} />
          <Kpi label="Budget lines" value={costCodes.toString()} />
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

      <Section
        title="Signing in"
        description="Who gets in, and through which door. Access itself is decided here by role, never by the identity provider"
      >
        <div className="card p-4">
          <DataList
            columns={2}
            items={[
              {
                label: 'Single sign-on',
                value: sso.provider === 'none' ? 'Not configured' : sso.label,
              },
              {
                label: 'Ready to use',
                value: sso.configured
                  ? 'Yes'
                  : sso.provider === 'none'
                    ? 'Password sign-in only'
                    : `No, ${sso.missing.join(' and ')} not set`,
              },
              {
                label: 'Addresses allowed',
                value: sso.allowedDomains.length > 0 ? sso.allowedDomains.join(', ') : 'Any domain',
              },
              { label: 'Failed attempts', value: 'Slowed automatically, doubling with each one' },
            ]}
          />
          <p className="mt-3 text-xs" style={{ color: 'var(--text-subtle)' }}>
            Signing in through a provider never creates an account. Somebody has to exist here first, with a role
            chosen deliberately, because the role is the whole of what they may see. A leaver switched off in your
            directory can no longer sign in, and switching them off here does the same.
          </p>
        </div>
      </Section>

      <Section
        title="Attached records"
        description="A signed change order is the evidence behind an approval, so it is held here and hashed rather than pointed at"
      >
        <div className="card p-4">
          <DataList
            columns={2}
            items={[
              { label: 'Where files go', value: storage.description },
              {
                label: 'Ready to use',
                value: storage.configured ? 'Yes' : `No, ${storage.missing.join(' and ')} not set`,
              },
              { label: 'Files held here', value: storedAttachments.toLocaleString('en-US') },
              {
                label: 'References to files elsewhere',
                value: referencedAttachments.toLocaleString('en-US'),
                hint: 'Recorded as a link or a path. Nothing here can prove one of these is unchanged.',
              },
            ]}
          />
          <p className="mt-3 text-xs" style={{ color: 'var(--text-subtle)' }}>
            Every stored file is hashed when it arrives and checked again on every download. A file that no longer
            matches is refused rather than served, because a record that has quietly changed is worse than a missing
            one: it looks right.
          </p>
        </div>
      </Section>

      <Section
        title="Reminders by email"
        description="Compliance deadlines are always on the dashboard and in the calendar feed. Email is optional, and either configured or plainly not"
      >
        <div className="card p-4">
          <DataList
            columns={2}
            items={[
              {
                label: 'Mail provider',
                value: mail.provider === 'none' ? 'Not configured' : titleize(mail.provider),
              },
              { label: 'Sending address', value: mail.from || 'Not set' },
              {
                label: 'Ready to send',
                value: mail.configured ? 'Yes' : `No, ${mail.missing.join(' and ')} not set`,
              },
              {
                label: 'Daily digest endpoint',
                value: digestScheduled
                  ? 'Open to a scheduler holding CRON_SECRET'
                  : 'Closed, because CRON_SECRET is not set',
              },
            ]}
          />
          <p className="mt-3 text-xs" style={{ color: 'var(--text-subtle)' }}>
            Point any scheduler at <code>/api/cron/compliance-digest</code> with an{' '}
            <code>Authorization: Bearer</code> header carrying <code>CRON_SECRET</code>. Nothing is sent on a day when
            nothing is overdue or due soon, so a message arriving always means there is something to do.
          </p>
        </div>
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
