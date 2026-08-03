'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import type { PocMethod } from '@/generated/prisma/client'

export async function setPocMethod(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:project_setup')

  const projectId = String(formData.get('projectId'))
  const pocMethod = String(formData.get('pocMethod')) as PocMethod
  const manualRaw = String(formData.get('manualPctComplete') ?? '')
  const manual = manualRaw === '' ? null : Math.max(0, Math.min(1, Number(manualRaw)))

  const project = await prisma.project.findFirst({ where: { id: projectId, companyId: user.companyId } })
  if (!project) return

  await prisma.project.update({
    where: { id: projectId },
    data: { pocMethod, manualPctComplete: manual },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'Project',
    entityId: projectId,
    action: 'UPDATE',
    field: 'pocMethod',
    oldValue: project.pocMethod,
    newValue: pocMethod,
    summary: `Percentage-of-completion method changed to ${pocMethod}${manual != null ? ` (manual ${(manual * 100).toFixed(0)}%)` : ''}`,
  })

  revalidatePath(`/projects/${projectId}/poc`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/')
}
