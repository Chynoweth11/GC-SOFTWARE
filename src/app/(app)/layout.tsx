import { redirect } from 'next/navigation'
import { destroySession, requireUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { can } from '@/lib/permissions'
import { AppShell } from '@/components/shell/app-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser()

  const [projects, company] = await Promise.all([
    prisma.project.findMany({
      where: {
        companyId: user.companyId,
        ...(user.role === 'PROJECT_MANAGER' ? {} : {}),
      },
      select: { id: true, number: true, name: true, status: true },
      orderBy: { number: 'asc' },
    }),
    prisma.company.findUniqueOrThrow({
      where: { id: user.companyId },
      select: { id: true, name: true },
    }),
  ])

  async function signOut() {
    'use server'
    await destroySession()
    redirect('/login')
  }

  return (
    <AppShell
      user={user}
      company={company}
      projects={projects}
      signOut={signOut}
      capabilities={{
        companyFinancials: can(user.role, 'view:company_financials'),
        estimates: can(user.role, 'view:estimates'),
        pipeline: can(user.role, 'view:pipeline'),
        admin: can(user.role, 'manage:reference_data'),
      }}
    >
      {children}
    </AppShell>
  )
}
