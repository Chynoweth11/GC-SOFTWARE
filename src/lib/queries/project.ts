import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import {
  buildCashFlow,
  buildCashFlowScenarios,
  buildProjectAlerts,
  computeProjectFinancials,
  defaultCurve,
  deriveChangeOrder,
  deriveCommitment,
  deriveQuantityProgress,
  endOfMonth,
  levelAll,
  overallQuantityProgress,
  safeDiv,
  sortAlerts,
  sumBy,
  type Alert,
  type CashFlowPeriodInput,
  type CommitmentDerived,
  type CostLineInput,
  type ProjectFinancials,
  type QuantityProgress,
} from '@/lib/finance'
import type { BillingInput, SovLineInput } from '@/lib/finance/billing'
import type { ChangeOrderDerived } from '@/lib/finance/changeOrders'
import type { LeveledPackage } from '@/lib/finance/leveling'

export interface ProjectBundle {
  project: NonNullable<Awaited<ReturnType<typeof loadProjectRecord>>>
  financials: ProjectFinancials
  changeOrders: ChangeOrderDerived[]
  changeOrderRecords: Awaited<ReturnType<typeof loadChangeOrders>>
  commitments: CommitmentDerived[]
  commitmentRecords: Awaited<ReturnType<typeof loadCommitments>>
  billings: BillingInput[]
  sovLines: SovLineInput[]
  quantities: QuantityProgress[]
  bidPackages: LeveledPackage[]
  cashFlow: ReturnType<typeof buildCashFlow>
  scenarios: ReturnType<typeof buildCashFlowScenarios>
  alerts: Alert[]
  lastForecastPeriodEnd: Date | null
  previousEacByCostCode: Map<string, number>
}

function loadProjectRecord(projectId: string, companyId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: {
      client: true,
      pm: true,
      company: true,
      sourceEstimate: { select: { id: true, name: true, version: true } },
    },
  })
}

function loadChangeOrders(projectId: string) {
  return prisma.changeOrder.findMany({
    where: { projectId },
    include: { trade: true, lines: { include: { costCode: true } } },
    orderBy: { number: 'asc' },
  })
}

function loadCommitments(projectId: string) {
  return prisma.commitment.findMany({
    where: { projectId },
    include: {
      vendor: { include: { trade: true } },
      lines: { include: { costCode: true } },
      changes: true,
      invoices: true,
    },
    orderBy: { number: 'asc' },
  })
}

/**
 * Loads one project and computes its complete financial position.
 *
 * Deliberately one function: budgets, commitments, costs, change orders,
 * billing and forecasting are interdependent, and computing them together in a
 * single pass is what guarantees the project page, the company dashboard and
 * every report agree on the numbers.
 */
export const getProjectBundle = cache(
  async (projectId: string, companyId: string): Promise<ProjectBundle | null> => {
    const project = await loadProjectRecord(projectId, companyId)
    if (!project) return null

    const dataDate = project.dataDate ?? new Date()

    const [
      budgetLines,
      revisions,
      commitmentRecords,
      costTx,
      changeOrderRecords,
      sovRecords,
      billingRecords,
      forecastPeriods,
      cashFlowPeriods,
      quantityItems,
      packageRecords,
    ] = await Promise.all([
      prisma.budgetLine.findMany({
        where: { projectId },
        include: { costCode: { include: { division: true } }, trade: true },
        orderBy: [{ sortOrder: 'asc' }, { costCode: { code: 'asc' } }],
      }),
      prisma.budgetRevision.findMany({ where: { projectId } }),
      loadCommitments(projectId),
      prisma.costTransaction.findMany({ where: { projectId, deletedAt: null } }),
      loadChangeOrders(projectId),
      prisma.sovLine.findMany({ where: { projectId }, orderBy: { sortOrder: 'asc' } }),
      prisma.ownerBilling.findMany({
        where: { projectId },
        include: { lines: true },
        orderBy: { appNumber: 'asc' },
      }),
      prisma.forecastPeriod.findMany({
        where: { projectId },
        include: { lines: true },
        orderBy: { periodEnd: 'desc' },
      }),
      prisma.cashFlowPeriod.findMany({ where: { projectId }, orderBy: { periodEnd: 'asc' } }),
      prisma.quantityItem.findMany({
        where: { projectId },
        include: { entries: true, costCode: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.bidPackage.findMany({
        where: { projectId },
        include: { trade: true, quotes: { include: { vendor: true } }, awardedVendor: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ])

    // ── Aggregate the transactional records onto their cost codes ─────────
    const revisionByLine = new Map<string, number>()
    for (const r of revisions) {
      revisionByLine.set(r.budgetLineId, (revisionByLine.get(r.budgetLineId) ?? 0) + r.amount)
    }

    const committedByCode = new Map<string, number>()
    for (const c of commitmentRecords) {
      const approvedChangeTotal = sumBy(
        c.changes.filter((ch) => ch.status === 'APPROVED'),
        (ch) => ch.amount,
      )
      const lineTotal = sumBy(c.lines, (l) => l.amount)
      // Approved changes are spread pro-rata across the commitment's cost codes.
      for (const line of c.lines) {
        const share = safeDiv(line.amount, lineTotal)
        const value = line.amount + approvedChangeTotal * share
        committedByCode.set(line.costCodeId, (committedByCode.get(line.costCodeId) ?? 0) + value)
      }
    }

    const actualByCode = new Map<string, number>()
    const accrualByCode = new Map<string, number>()
    for (const tx of costTx) {
      const target = tx.type === 'ACCRUAL' ? accrualByCode : actualByCode
      target.set(tx.costCodeId, (target.get(tx.costCodeId) ?? 0) + tx.amount)
    }

    // ── Latest forecast provides % complete and any ETC overrides ─────────
    const latestForecast = forecastPeriods[0] ?? null
    const previousForecast = forecastPeriods.find((p) => p.status === 'LOCKED' && p.id !== latestForecast?.id) ?? forecastPeriods[1] ?? null

    const forecastByCode = new Map(latestForecast?.lines.map((l) => [l.costCodeId, l]) ?? [])
    const previousEacByCostCode = new Map(
      previousForecast?.lines.map((l) => [l.costCodeId, l.estimateAtCompletion]) ?? [],
    )

    const costLines: CostLineInput[] = budgetLines.map((line) => {
      const forecast = forecastByCode.get(line.costCodeId)
      return {
        costCodeId: line.costCodeId,
        code: line.costCode.code,
        description: line.description || line.costCode.description,
        category: line.category,
        tradeId: line.tradeId,
        tradeName: line.trade?.name ?? null,
        divisionCode: line.costCode.division?.code ?? null,
        originalBudget: line.originalBudget,
        budgetRevisions: revisionByLine.get(line.id) ?? 0,
        committed: committedByCode.get(line.costCodeId) ?? 0,
        costToDate: actualByCode.get(line.costCodeId) ?? 0,
        accruals: accrualByCode.get(line.costCodeId) ?? 0,
        pctComplete: forecast?.pctComplete ?? null,
        etcOverride: forecast?.etcOverride ?? null,
        notes: line.notes,
      }
    })

    // ── Change orders and commitments ─────────────────────────────────────
    const changeOrders = changeOrderRecords.map((co) =>
      deriveChangeOrder(
        {
          id: co.id,
          number: co.number,
          status: co.status,
          type: co.type,
          ownerAmount: co.ownerAmount,
          costAmount: co.costAmount,
          probabilityPct: co.probabilityPct,
          dateInitiated: co.dateInitiated,
          dateApproved: co.dateApproved,
          scheduleImpactDays: co.scheduleImpactDays,
        },
        dataDate,
      ),
    )

    const budgetByCode = new Map(
      budgetLines.map((l) => [l.costCodeId, l.originalBudget + (revisionByLine.get(l.id) ?? 0)]),
    )

    const commitments = commitmentRecords.map((c) =>
      deriveCommitment({
        id: c.id,
        number: c.number,
        type: c.type,
        vendorId: c.vendorId,
        vendorName: c.vendor.name,
        originalAmount: c.originalAmount,
        retentionPct: c.retentionPct,
        pctComplete: c.pctComplete,
        status: c.status,
        forecastFinalOverride: c.forecastFinalOverride,
        budgetAmount: sumBy(c.lines, (l) => budgetByCode.get(l.costCodeId) ?? 0),
        changes: c.changes.map((ch) => ({ amount: ch.amount, status: ch.status })),
        invoices: c.invoices.map((i) => ({
          amount: i.amount,
          retentionPct: i.retentionPct,
          approved: i.approved,
          amountPaid: i.amountPaid,
          dateReceived: i.dateReceived,
          datePaid: i.datePaid,
          lienWaiverReceived: i.lienWaiverReceived,
        })),
      }),
    )

    // ── Billing ───────────────────────────────────────────────────────────
    const sovLines: SovLineInput[] = sovRecords.map((s) => ({
      id: s.id,
      number: s.number,
      description: s.description,
      scheduledValue: s.scheduledValue,
      costCodeId: s.costCodeId,
      changeOrderNumber: s.changeOrderNumber,
    }))

    const billings: BillingInput[] = billingRecords.map((b) => ({
      id: b.id,
      appNumber: b.appNumber,
      periodTo: b.periodTo,
      dateSubmitted: b.dateSubmitted,
      dateApproved: b.dateApproved,
      datePaid: b.datePaid,
      retainagePct: b.retainagePct,
      amountPaid: b.amountPaid,
      status: b.status,
      lines: b.lines.map((l) => ({
        sovLineId: l.sovLineId,
        workThisPeriod: l.workThisPeriod,
        storedMaterials: l.storedMaterials,
      })),
    }))

    // ── Progress measures for the POC selector ────────────────────────────
    const quantities = quantityItems.map((q) =>
      deriveQuantityProgress({
        itemId: q.id,
        description: q.description,
        uom: q.uom,
        costCode: q.costCode?.code ?? null,
        budgetQty: q.budgetQty,
        budgetUnitRate: q.budgetUnitRate,
        materialOrderedQty: q.materialOrderedQty,
        entries: q.entries.map((e) => ({
          installedQty: e.installedQty,
          actualHours: e.actualHours,
          crewDays: e.crewDays,
        })),
      }),
    )

    const subcontractRows = commitments.filter((c) => c.type === 'SUBCONTRACT')
    const subcontractorPctComplete =
      subcontractRows.length > 0
        ? safeDiv(
            sumBy(subcontractRows, (c) => c.currentValue * c.pctComplete),
            sumBy(subcontractRows, (c) => c.currentValue),
          )
        : null

    const schedulePctComplete =
      project.contractStart && project.forecastCompletion
        ? Math.max(
            0,
            Math.min(
              1,
              safeDiv(
                dataDate.getTime() - project.contractStart.getTime(),
                project.forecastCompletion.getTime() - project.contractStart.getTime(),
              ),
            ),
          )
        : null

    // ── Cash flow curve ───────────────────────────────────────────────────
    const curveSource: CashFlowPeriodInput[] =
      cashFlowPeriods.length > 0
        ? cashFlowPeriods.map((p) => ({
            periodEnd: p.periodEnd,
            plannedDeltaPct: p.plannedDeltaPct,
            actualPctComplete: p.actualPctComplete,
            actualCost: p.actualCost,
            billingOverride: p.billingOverride,
            collectionOverride: p.collectionOverride,
            notes: p.notes,
          }))
        : defaultCurve(
            project.contractStart ?? dataDate,
            project.forecastCompletion ?? project.contractCompletion ?? dataDate,
          )

    const plannedCumAtDataDate = (() => {
      let running = 0
      const target = endOfMonth(dataDate).getTime()
      for (const p of curveSource) {
        running += p.plannedDeltaPct
        if (p.periodEnd.getTime() >= target) break
      }
      return Math.min(1, running)
    })()

    const financials = computeProjectFinancials({
      projectId: project.id,
      dataDate,
      contractCompletion: project.contractCompletion,
      forecastCompletion: project.forecastCompletion,
      originalContractSum: project.originalContractSum,
      ownerRetentionPct: project.ownerRetentionPct,
      targetMarginPct: project.targetMarginPct,
      eacMethod: project.eacMethod,
      pocMethod: project.pocMethod,
      manualPctComplete: project.manualPctComplete,
      pendingCoInclusionPct: project.pendingCoInclusionPct,
      plannedCumPctAtDataDate: plannedCumAtDataDate,
      safetyScore: project.safetyScore,
      qualityScore: project.qualityScore,
      costLines,
      changeOrders,
      commitments,
      billings,
      sovLines,
      quantityPctComplete: overallQuantityProgress(quantities),
      subcontractorPctComplete,
      schedulePctComplete,
    })

    // Actual billings and collections by month, for the historical part of the curve.
    const actualBillingsByMonth = new Map<string, number>()
    const actualCollectionsByMonth = new Map<string, number>()
    for (const b of billingRecords) {
      const billed = sumBy(b.lines, (l) => l.workThisPeriod + l.storedMaterials)
      const k = monthKeyOf(b.periodTo)
      actualBillingsByMonth.set(k, (actualBillingsByMonth.get(k) ?? 0) + billed)
      if (b.datePaid && b.amountPaid) {
        const pk = monthKeyOf(b.datePaid)
        actualCollectionsByMonth.set(pk, (actualCollectionsByMonth.get(pk) ?? 0) + b.amountPaid)
      }
    }

    const cashFlowCtx = {
      dataDate,
      contractStart: project.contractStart ?? dataDate,
      forecastCompletion: project.forecastCompletion ?? project.contractCompletion ?? dataDate,
      contractValue: financials.contract.currentContract,
      forecastCost: financials.forecastCost,
      costToDate: financials.totalCostToDate,
      ownerRetentionPct: project.ownerRetentionPct,
      billedToDate: financials.billing.totalCompletedAndStored,
      collectedToDate: financials.billing.amountCollected,
      actualBillingsByMonth,
      actualCollectionsByMonth,
      collectionLagMonths: 1,
    }

    const cashFlow = buildCashFlow(curveSource, cashFlowCtx)
    const scenarios = buildCashFlowScenarios(curveSource, cashFlowCtx)

    const bidPackages = levelAll(
      packageRecords.map((p) => ({
        id: p.id,
        name: p.name,
        tradeName: p.trade?.name ?? null,
        divisionCode: p.divisionCode,
        budgetAmount: p.budgetAmount,
        carriedAmount: p.carriedAmount,
        awardedVendorId: p.awardedVendorId,
        awardAmount: p.awardAmount,
        status: p.status,
        notes: p.notes,
        quotes: p.quotes.map((q) => ({
          id: q.id,
          vendorId: q.vendorId,
          vendorName: q.vendor?.name ?? q.vendorName,
          baseAmount: q.baseAmount,
          adjustmentAmount: q.adjustmentAmount,
          inclusions: q.inclusions,
          exclusions: q.exclusions,
          qualifications: q.qualifications,
          allowances: q.allowances,
          status: q.status,
          notes: q.notes,
        })),
      })),
    )

    const lockedPeriods = forecastPeriods.filter((p) => p.status === 'LOCKED')
    const lastForecastPeriodEnd = lockedPeriods[0]?.periodEnd ?? null

    const alerts = sortAlerts(
      buildProjectAlerts({
        projectId: project.id,
        projectNumber: project.number,
        projectName: project.name,
        dataDate,
        financials,
        commitments,
        lastForecastPeriodEnd,
        previousEacByCostCode,
        targetMarginPct: project.targetMarginPct,
      }),
    )

    return {
      project,
      financials,
      changeOrders,
      changeOrderRecords,
      commitments,
      commitmentRecords,
      billings,
      sovLines,
      quantities,
      bidPackages,
      cashFlow,
      scenarios,
      alerts,
      lastForecastPeriodEnd,
      previousEacByCostCode,
    }
  },
)

function monthKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
