import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import { getEstimateBundle } from './estimate'
import { safeDiv, sumBy, type CostLine, type EstimateSummary } from '@/lib/finance'
import type { CostCategory } from '@/generated/prisma/client'

/**
 * Ties a project's priced basis back to how the job is actually going.
 *
 * The basis is the promise the company made when it took the work on; the
 * budget, cost, commitments and forecast are what happened. Putting them on one
 * page is the only way to answer the question every post-mortem starts with:
 * where did we get the price wrong?
 *
 * Where that basis comes from depends on how the project began. A project
 * converted from an estimate carries the full takeoff, so the comparison is
 * against what was priced line by line. A project set up directly has its
 * original budget, which is the same promise recorded at a coarser grain. Both
 * are real, and the page says which one it is reading rather than implying the
 * richer one is always there.
 *
 * Nothing here is stored. Both sides are read live from the same engines that
 * drive the estimating pages and the cost control pages, so this comparison can
 * never disagree with either of them.
 */

export type BasisKind = 'estimate' | 'original-budget'

export interface EstimateVsActualRow {
  key: string
  label: string
  /** Cost carried in the priced basis for this cost type. */
  estimated: number
  currentBudget: number
  committed: number
  costToDate: number
  forecast: number
  /** Forecast against the priced basis. Negative means worse than priced. */
  varianceToEstimate: number
  /** Forecast against the current budget. Negative means over budget. */
  varianceToBudget: number
}

export interface TakeoffDetail {
  estimate: NonNullable<Awaited<ReturnType<typeof getEstimateBundle>>>['estimate']
  summary: EstimateSummary
  alternates: { id: string; number: string; description: string; amount: number; accepted: boolean }[]
  clarifications: { id: string; text: string }[]
}

export interface ProjectEstimateComparison {
  basis: BasisKind
  /** What the estimated column is, in words, for the page to say plainly. */
  basisLabel: string
  rows: EstimateVsActualRow[]
  totals: EstimateVsActualRow
  bid: {
    /** Direct cost in the priced basis. */
    directCost: number
    /** Total bid submitted. Null when there is no estimate behind the project. */
    totalBid: number | null
    marginPriced: number | null
    originalContract: number
    currentContract: number
  }
  /** Present only when the project was converted from an estimate. */
  takeoff: TakeoffDetail | null
}

/** Maps a takeoff line onto the cost type its money lands in. */
function splitItemByCostType(item: EstimateSummary['items'][number]): Partial<Record<CostCategory, number>> {
  return {
    LABOR: item.laborCost,
    MATERIAL: item.materialCost,
    EQUIPMENT: item.equipmentCost,
    SUBCONTRACT: item.subCost,
  }
}

/**
 * Totals the estimate by cost type, so it lines up with the budget, which is
 * also kept by cost type. General conditions come from the dedicated sheet
 * rather than the takeoff, and land in their own bucket.
 */
export function estimateByCostType(summary: EstimateSummary): Map<CostCategory, number> {
  const totals = new Map<CostCategory, number>()

  for (const item of summary.items) {
    for (const [category, amount] of Object.entries(splitItemByCostType(item))) {
      if (!amount) continue
      totals.set(category as CostCategory, (totals.get(category as CostCategory) ?? 0) + amount)
    }
  }

  if (summary.gcTotal) {
    totals.set('GENERAL_CONDITIONS', (totals.get('GENERAL_CONDITIONS') ?? 0) + summary.gcTotal)
  }

  return totals
}

const CATEGORY_ORDER: CostCategory[] = [
  'LABOR',
  'MATERIAL',
  'EQUIPMENT',
  'SUBCONTRACT',
  'GENERAL_CONDITIONS',
  'OVERHEAD',
  'CONTINGENCY',
  'OTHER',
]

const CATEGORY_NAMES: Record<CostCategory, string> = {
  LABOR: 'Labor',
  MATERIAL: 'Material',
  EQUIPMENT: 'Equipment',
  SUBCONTRACT: 'Subcontract',
  GENERAL_CONDITIONS: 'General conditions',
  OVERHEAD: 'Overhead',
  CONTINGENCY: 'Contingency',
  OTHER: 'Other',
}

export const getProjectEstimateComparison = cache(
  async (
    projectId: string,
    companyId: string,
    lines: readonly CostLine[],
    contract: { original: number; current: number },
  ): Promise<ProjectEstimateComparison> => {
    const project = await prisma.project.findFirst({
      where: { id: projectId, companyId },
      select: { sourceEstimateId: true },
    })

    const bundle = project?.sourceEstimateId ? await getEstimateBundle(project.sourceEstimateId, companyId) : null

    // With an estimate behind the project the basis is what was priced. Without
    // one it is the original budget, which is the same commitment recorded when
    // the job was set up.
    const estimated = bundle
      ? estimateByCostType(bundle.summary)
      : lines.reduce((totals, line) => {
          totals.set(line.category, (totals.get(line.category) ?? 0) + line.originalBudget)
          return totals
        }, new Map<CostCategory, number>())

    const rows: EstimateVsActualRow[] = CATEGORY_ORDER.map((category) => {
      const matching = lines.filter((line) => line.category === category)
      const estimateAmount = estimated.get(category) ?? 0
      const currentBudget = sumBy(matching, (line) => line.currentBudget)
      const forecast = sumBy(matching, (line) => line.forecastAtCompletion)

      return {
        key: category,
        label: CATEGORY_NAMES[category],
        estimated: estimateAmount,
        currentBudget,
        committed: sumBy(matching, (line) => line.committed),
        costToDate: sumBy(matching, (line) => line.totalCostToDate),
        forecast,
        varianceToEstimate: estimateAmount - forecast,
        varianceToBudget: currentBudget - forecast,
      }
    }).filter(
      (row) =>
        row.estimated !== 0 || row.currentBudget !== 0 || row.costToDate !== 0 || row.committed !== 0 || row.forecast !== 0,
    )

    const totals: EstimateVsActualRow = {
      key: '__total',
      label: 'All cost types',
      estimated: sumBy(rows, (row) => row.estimated),
      currentBudget: sumBy(rows, (row) => row.currentBudget),
      committed: sumBy(rows, (row) => row.committed),
      costToDate: sumBy(rows, (row) => row.costToDate),
      forecast: sumBy(rows, (row) => row.forecast),
      varianceToEstimate: 0,
      varianceToBudget: 0,
    }
    totals.varianceToEstimate = totals.estimated - totals.forecast
    totals.varianceToBudget = totals.currentBudget - totals.forecast

    return {
      basis: bundle ? 'estimate' : 'original-budget',
      basisLabel: bundle
        ? `estimate "${bundle.estimate.name}" version ${bundle.estimate.version}`
        : 'the original budget set when this project was opened',
      rows,
      totals,
      bid: {
        directCost: bundle ? bundle.summary.directCost : totals.estimated,
        totalBid: bundle ? bundle.summary.buildUp.totalBid : null,
        marginPriced: bundle ? bundle.summary.buildUp.grossMarginOnBid : null,
        originalContract: contract.original,
        currentContract: contract.current,
      },
      takeoff: bundle
        ? {
            estimate: bundle.estimate,
            summary: bundle.summary,
            alternates: bundle.estimate.alternates.map((alternate) => ({
              id: alternate.id,
              number: alternate.number,
              description: alternate.description,
              amount: alternate.amount,
              accepted: alternate.accepted,
            })),
            clarifications: bundle.estimate.clarifications.map((clarification) => ({
              id: clarification.id,
              text: clarification.text,
            })),
          }
        : null,
    }
  },
)

/** Share of the basis a cost type carried, for the mix comparison. */
export function shareOf(row: EstimateVsActualRow, totals: EstimateVsActualRow) {
  return {
    estimated: safeDiv(row.estimated, totals.estimated),
    forecast: safeDiv(row.forecast, totals.forecast),
  }
}
