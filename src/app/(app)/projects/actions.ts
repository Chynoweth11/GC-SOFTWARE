'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { ProjectStatus } from '@/generated/prisma/client'

const STATUSES = [
  'BIDDING',
  'AWARDED',
  'PRECONSTRUCTION',
  'UNDER_CONSTRUCTION',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CLOSED',
] as const

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Creates a project.
 *
 * The company defaults seed the retention, margin, burden and overhead rates so
 * a new job starts consistent with every other one, and the estimator does not
 * have to remember four percentages. They remain editable per project.
 */
export async function createProject(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:project_setup')

  const number = String(formData.get('number') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  if (!number) return { error: 'A project needs a job number.' }
  if (!name) return { error: 'A project needs a name.' }

  const clash = await prisma.project.findFirst({ where: { companyId: user.companyId, number } })
  if (clash) return { error: `Job number ${number} is already in use by ${clash.name}.` }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } })

  const statusInput = String(formData.get('status') ?? '')
  const status = ((STATUSES as readonly string[]).includes(statusInput) ? statusInput : 'ACTIVE') as ProjectStatus

  const number0 = (key: string) => {
    const value = Number(formData.get(key))
    return isFinite(value) && value >= 0 ? value : 0
  }
  const clientId = String(formData.get('clientId') ?? '') || null
  const pmUserId = String(formData.get('pmUserId') ?? '') || null

  const created = await prisma.project.create({
    data: {
      companyId: user.companyId,
      number,
      name,
      status,
      projectType: String(formData.get('projectType') ?? '').trim() || null,
      city: String(formData.get('city') ?? '').trim() || null,
      state: String(formData.get('state') ?? '').trim() || null,
      clientId,
      pmUserId,
      originalContractSum: number0('originalContractSum'),
      contractStart: parseDate(formData.get('contractStart')),
      contractCompletion: parseDate(formData.get('contractCompletion')),
      forecastCompletion: parseDate(formData.get('contractCompletion')),
      dataDate: new Date(),
      ownerRetentionPct: company.defaultRetentionPct,
      defaultSubRetentionPct: company.defaultRetentionPct,
      targetMarginPct: company.targetMarginPct,
      laborBurdenPct: company.defaultLaborBurdenPct,
      overheadPct: company.defaultOverheadPct,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Project',
    entityId: created.id,
    entityLabel: `${created.number} ${created.name}`,
    action: 'CREATE',
    newValue: `${created.number} ${created.name}`,
    summary: `Created project ${created.number} ${created.name}`,
  })

  revalidatePath('/projects')
  revalidatePath('/')
  redirect(`/projects/${created.id}/settings`)
}
