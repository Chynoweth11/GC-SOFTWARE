'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

/**
 * Creates an estimate.
 *
 * The markup chain, burden and tax rates come from the company defaults so a new
 * estimate starts on the same basis as every other one, and the estimator does
 * not have to remember seven percentages. All of them stay editable on the
 * estimate's setup tab.
 */
export async function createEstimate(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:estimates')

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Give the estimate a name.' }

  const clash = await prisma.estimate.findFirst({ where: { companyId: user.companyId, name } })
  if (clash) return { error: `There is already an estimate called ${name}. Rename this one or open the existing estimate.` }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } })

  const parseDate = (value: FormDataEntryValue | null) => {
    const raw = String(value ?? '').trim()
    if (!raw) return null
    const parsed = new Date(raw)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  const num = (key: string) => {
    const value = Number(formData.get(key))
    return isFinite(value) && value >= 0 ? value : 0
  }

  const created = await prisma.estimate.create({
    data: {
      companyId: user.companyId,
      name,
      clientName: String(formData.get('clientName') ?? '').trim() || null,
      architect: String(formData.get('architect') ?? '').trim() || null,
      address: String(formData.get('address') ?? '').trim() || null,
      projectType: String(formData.get('projectType') ?? '').trim() || null,
      estimator: String(formData.get('estimator') ?? '').trim() || user.name,
      bidDueDate: parseDate(formData.get('bidDueDate')),
      durationWeeks: num('durationWeeks'),
      buildingAreaSf: num('buildingAreaSf'),
      laborBurdenPct: company.defaultLaborBurdenPct,
      overheadPct: company.defaultOverheadPct,
      profitPct: company.targetMarginPct,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Estimate',
    entityId: created.id,
    entityLabel: created.name,
    action: 'CREATE',
    newValue: created.name,
    summary: `Created the estimate ${created.name}`,
  })

  revalidatePath('/estimating')
  redirect(`/estimating/${created.id}/setup`)
}
