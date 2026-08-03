import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import { levelAll, levelingSummary, summarizeEstimate, type EstimateItemInput, type MeasureType } from '@/lib/finance'

export const getEstimateBundle = cache(async (estimateId: string, companyId: string) => {
  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, companyId },
    include: {
      bid: { include: { client: true } },
      laborRates: { orderBy: { sortOrder: 'asc' } },
      sections: { orderBy: { sortOrder: 'asc' } },
      items: { include: { division: true, section: true }, orderBy: { sortOrder: 'asc' } },
      gcItems: { orderBy: { sortOrder: 'asc' } },
      alternates: { orderBy: { sortOrder: 'asc' } },
      clarifications: { orderBy: { sortOrder: 'asc' } },
      bidPackages: { include: { trade: true, quotes: { include: { vendor: true } }, awardedVendor: true }, orderBy: { sortOrder: 'asc' } },
      projects: { select: { id: true, number: true, name: true } },
    },
  })
  if (!estimate) return null

  const packages = levelAll(
    estimate.bidPackages.map((p) => ({
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

  const items: EstimateItemInput[] = estimate.items.map((i) => ({
    id: i.id,
    sectionId: i.sectionId,
    sectionName: i.section?.name ?? null,
    divisionCode: i.division?.code ?? null,
    divisionName: i.division?.name ?? null,
    description: i.description,
    drawingRef: i.drawingRef,
    measure: i.measure as MeasureType,
    count: i.count,
    length: i.length,
    width: i.width,
    depth: i.depth,
    netQtyOverride: i.netQtyOverride,
    uom: i.uom,
    wastePct: i.wastePct,
    laborClass: i.laborClass,
    laborHrsPerUnit: i.laborHrsPerUnit,
    laborRateOverride: i.laborRateOverride,
    materialUnitCost: i.materialUnitCost,
    equipmentUnitCost: i.equipmentUnitCost,
    subUnitCost: i.subUnitCost,
    notes: i.notes,
  }))

  const summary = summarizeEstimate({
    items,
    gcItems: estimate.gcItems.map((g) => ({
      id: g.id,
      item: g.item,
      basis: g.basis,
      qty: g.qty,
      followsDuration: g.followsDuration,
      unitCost: g.unitCost,
      notes: g.notes,
    })),
    factors: {
      laborBurdenPct: estimate.laborBurdenPct,
      salesTaxPct: estimate.salesTaxPct,
      smallToolsPct: estimate.smallToolsPct,
      laborRates: new Map(estimate.laborRates.map((r) => [r.className, r.rate])),
    },
    durationWeeks: estimate.durationWeeks,
    buildingAreaSf: estimate.buildingAreaSf,
    smallToolsPct: estimate.smallToolsPct,
    markups: {
      contingencyPct: estimate.contingencyPct,
      overheadPct: estimate.overheadPct,
      profitPct: estimate.profitPct,
      glInsurancePct: estimate.glInsurancePct,
      bondPct: estimate.bondPct,
      exciseTaxPct: estimate.exciseTaxPct,
      roundToNearest: estimate.roundToNearest,
    },
    pendingQuotes: packages.reduce((a, p) => a + p.quotes.filter((q) => q.status === 'PENDING').length, 0),
    quoteVarianceRows: estimate.bidPackages.filter(
      (p) => p.awardAmount > 0 && Math.abs(p.awardAmount - p.carriedAmount) > 0.005,
    ).length,
  })

  return {
    estimate,
    summary,
    packages,
    levelingSummary: levelingSummary(packages),
  }
})

export const listEstimates = cache(async (companyId: string) => {
  const estimates = await prisma.estimate.findMany({
    where: { companyId },
    include: {
      bid: { select: { number: true, name: true, status: true } },
      _count: { select: { items: true, bidPackages: true } },
      projects: { select: { id: true, number: true } },
    },
    orderBy: [{ updatedAt: 'desc' }],
  })

  // Total each estimate through the same engine the detail page uses.
  return Promise.all(
    estimates.map(async (e) => {
      const bundle = await getEstimateBundle(e.id, companyId)
      return {
        ...e,
        directCost: bundle?.summary.directCost ?? 0,
        totalBid: bundle?.summary.buildUp.roundedBid ?? 0,
        margin: bundle?.summary.buildUp.grossMarginOnBid ?? 0,
        qaIssues: bundle?.summary.qa.issues.length ?? 0,
      }
    }),
  )
})
