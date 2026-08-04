import { requireUser } from '@/lib/auth'
import { can, capabilitiesFor, ROLE_LABELS } from '@/lib/permissions'
import { forbidden } from 'next/navigation'
import { prisma } from '@/lib/db'
import { date } from '@/lib/format'
import { Pill, Section, StatusPill } from '@/components/ui'
import { UserForm } from '@/components/admin/user-form'
import { createUser, updateUserRole, toggleUserActive } from '../actions'
import type { Role } from '@/generated/prisma/client'

export const metadata = { title: 'Users and roles' }

const ROLES: Role[] = ['OWNER', 'ADMIN', 'EXECUTIVE', 'PROJECT_MANAGER', 'PROJECT_ENGINEER', 'ESTIMATOR', 'ACCOUNTING', 'FINANCE', 'READ_ONLY']

/** The sensitive capabilities the brief asks to be restricted, named plainly. */
const SENSITIVE: { capability: Parameters<typeof can>[1]; label: string }[] = [
  { capability: 'view:company_financials', label: 'Company financials' },
  { capability: 'view:margins', label: 'Project margins' },
  { capability: 'view:labor_rates', label: 'Labor rates' },
  { capability: 'view:markups', label: 'Markups' },
  { capability: 'view:cash_position', label: 'Cash position' },
]

export default async function UsersPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:users')) forbidden()

  const users = await prisma.user.findMany({
    where: { companyId: user.companyId },
    include: { _count: { select: { managedProjects: true } } },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })

  return (
    <div className="space-y-6">
      <Section title="Users" description="Roles map to capabilities: changing a role changes what the person can see and do immediately">
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th className="num">Projects managed</th>
                  <th>Last signed in</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={u.active ? undefined : { opacity: 0.6 }}>
                    <td className="font-medium">
                      {u.name}
                      {u.id === user.id && (
                        <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                          (you)
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                    <td>
                      <form action={updateUserRole} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <select name="role" defaultValue={u.role} className="field w-auto py-1 text-xs" aria-label={`Role for ${u.name}`}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                          Set
                        </button>
                      </form>
                    </td>
                    <td className="num">{u._count.managedProjects}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{date(u.lastLoginAt)}</td>
                    <td>
                      <StatusPill status={u.active ? 'APPROVED' : 'VOID'} label={u.active ? 'Active' : 'Deactivated'} />
                    </td>
                    <td className="no-print">
                      {u.id !== user.id && (
                        <form action={toggleUserActive}>
                          <input type="hidden" name="userId" value={u.id} />
                          <button type="submit" className="btn btn-ghost px-1.5 py-0.5 text-[11px]">
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Add a user">
        <UserForm action={createUser} roles={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      </Section>

      <Section
        title="What each role can see"
        description="Company profit, project margins, labor rates, markups and cash position are restricted by role"
      >
        <div className="card-flush">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Role</th>
                  {SENSITIVE.map((s) => (
                    <th key={s.label}>{s.label}</th>
                  ))}
                  <th className="num">Total capabilities</th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role) => (
                  <tr key={role}>
                    <td className="font-medium">{ROLE_LABELS[role]}</td>
                    {SENSITIVE.map((s) => (
                      <td key={s.label}>
                        {can(role, s.capability) ? (
                          <Pill tone="favorable">Visible</Pill>
                        ) : (
                          <Pill tone="neutral">Hidden</Pill>
                        )}
                      </td>
                    ))}
                    <td className="num">{capabilitiesFor(role).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>
    </div>
  )
}
