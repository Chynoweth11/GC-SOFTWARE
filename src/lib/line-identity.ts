import 'server-only'
import { prisma } from '@/lib/db'
import { CATEGORY_LABELS } from '@/lib/finance/cost'
import type { CostCategory } from '@/generated/prisma/client'

/**
 * The internal identity behind a budget line.
 *
 * People work with a cost type and a description. Underneath, every line still
 * needs a stable key so cost, commitments, change orders and forecasts can point
 * at the same thing and roll up together, so one is generated here and never
 * shown. Nobody maintains a catalogue of codes; the code is bookkeeping.
 *
 * The prefix comes from the cost type, which makes the stored data readable if
 * anyone ever looks at it directly, without asking a user to invent one.
 */

const PREFIXES: Record<CostCategory, string> = {
  LABOR: 'LAB',
  MATERIAL: 'MAT',
  EQUIPMENT: 'EQP',
  SUBCONTRACT: 'SUB',
  GENERAL_CONDITIONS: 'GEN',
  OVERHEAD: 'OVH',
  CONTINGENCY: 'CTG',
  OTHER: 'OTH',
}

/** How a line reads on screen: its description, with the cost type behind it. */
export function lineLabel(description: string, category: CostCategory): string {
  return `${description} (${CATEGORY_LABELS[category]})`
}

/**
 * Creates the identity for a new line.
 *
 * Numbers run per cost type within a company, so LAB-001 through LAB-nnn. The
 * loop guards against two lines being added at the same instant taking the same
 * number, which the unique index would otherwise reject.
 */
export async function createLineIdentity(
  companyId: string,
  category: CostCategory,
  description: string,
  tradeId?: string | null,
): Promise<string> {
  const prefix = PREFIXES[category] ?? 'OTH'

  for (let attempt = 0; attempt < 25; attempt++) {
    const used = await prisma.costCode.count({ where: { companyId, code: { startsWith: `${prefix}-` } } })
    const code = `${prefix}-${String(used + 1 + attempt).padStart(3, '0')}`

    const clash = await prisma.costCode.findFirst({ where: { companyId, code } })
    if (clash) continue

    const created = await prisma.costCode.create({
      data: { companyId, code, description, category, tradeId: tradeId ?? null },
    })
    return created.id
  }

  throw new Error('Could not allocate an identity for this line. Try again.')
}
