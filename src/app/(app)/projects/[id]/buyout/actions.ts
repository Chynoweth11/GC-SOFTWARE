'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'

/**
 * Awards a bid package to a bidder at their leveled amount.
 *
 * On a project this is the buyout decision, so it also drafts the subcontract:
 * the awarded value becomes a commitment against the package's cost code, and
 * the buyout saving falls out of the budget comparison automatically.
 */
export async function awardPackage(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:commitments')

  const packageId = String(formData.get('packageId'))
  const quoteId = String(formData.get('quoteId'))
  const contextId = String(formData.get('contextId'))
  const contextType = String(formData.get('contextType'))

  const pkg = await prisma.bidPackage.findFirst({
    where: {
      id: packageId,
      OR: [{ project: { companyId: user.companyId } }, { estimate: { companyId: user.companyId } }],
    },
    include: { quotes: true, trade: { include: { costCodes: true } } },
  })
  if (!pkg) return { error: 'Package not found.' }

  const quote = pkg.quotes.find((q) => q.id === quoteId)
  if (!quote) return { error: 'Quote not found on this package.' }

  const leveled = quote.baseAmount + quote.adjustmentAmount
  if (leveled <= 0) return { error: 'That bidder has no bid to award.' }

  await prisma.bidPackage.update({
    where: { id: packageId },
    data: { awardedVendorId: quote.vendorId, awardAmount: leveled, status: 'AWARDED' },
  })

  // On a project, drafting the subcontract closes the loop from bid to commitment.
  if (contextType === 'project' && pkg.projectId && quote.vendorId) {
    const costCodeId = pkg.trade?.costCodes[0]?.id
    if (costCodeId) {
      const budgetLine = await prisma.budgetLine.findFirst({ where: { projectId: pkg.projectId, costCodeId } })
      const existing = await prisma.commitment.findFirst({
        where: { projectId: pkg.projectId, vendorId: quote.vendorId, type: 'SUBCONTRACT' },
      })
      if (budgetLine && !existing) {
        const count = await prisma.commitment.count({ where: { projectId: pkg.projectId } })
        const project = await prisma.project.findUniqueOrThrow({ where: { id: pkg.projectId } })
        await prisma.commitment.create({
          data: {
            projectId: pkg.projectId,
            vendorId: quote.vendorId,
            type: 'SUBCONTRACT',
            number: `${project.number}-SC-${String(count + 1).padStart(2, '0')}`,
            description: pkg.name,
            scopeOfWork: quote.inclusions,
            originalAmount: leveled,
            retentionPct: project.defaultSubRetentionPct,
            status: 'DRAFT',
            dateIssued: new Date(),
            lines: { create: [{ costCodeId, amount: leveled }] },
          },
        })
      }
    }
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    entity: 'BidPackage',
    entityId: packageId,
    action: 'AWARD',
    summary: `Awarded ${pkg.name} to ${quote.vendorName} at ${leveled} (budget ${pkg.budgetAmount})`,
  })

  if (contextType === 'project') {
    revalidatePath(`/projects/${contextId}/buyout`)
    revalidatePath(`/projects/${contextId}/commitments`)
    revalidatePath(`/projects/${contextId}`)
  } else {
    revalidatePath(`/estimating/${contextId}/leveling`)
    revalidatePath(`/estimating/${contextId}`)
  }
  return {}
}
