import { money, mround, num, safeDiv, sumBy } from './core'

export type MeasureType =
  | 'EA'
  | 'LF'
  | 'SF'
  | 'SY'
  | 'CY'
  | 'CF'
  | 'TON'
  | 'LB'
  | 'HR'
  | 'DAY'
  | 'LS'
  | 'ALLOWANCE'

export const MEASURE_LABELS: Record<MeasureType, string> = {
  EA: 'Each',
  LF: 'Linear feet',
  SF: 'Square feet',
  SY: 'Square yards',
  CY: 'Cubic yards',
  CF: 'Cubic feet',
  TON: 'Tons',
  LB: 'Pounds',
  HR: 'Hours',
  DAY: 'Days',
  LS: 'Lump sum',
  ALLOWANCE: 'Allowance',
}

/**
 * Derives net quantity from the dimension fields.
 *
 * Workbook source: Takeoff ▸ I (the nested IF over the Measure column):
 *   EA  → count            LF → count × length
 *   SF  → count × L × W    SY → count × L × W ÷ 9
 *   CY  → count × L × W × D ÷ 27
 *   LS  → MAX(count, 1)    TON → count
 *
 * CF, LB, HR and DAY extend the same pattern; ALLOWANCE behaves like a lump sum.
 */
export function deriveNetQuantity(item: {
  measure: MeasureType
  count: number
  length: number
  width: number
  depth: number
}): number {
  const c = num(item.count)
  const l = num(item.length)
  const w = num(item.width)
  const d = num(item.depth)

  switch (item.measure) {
    case 'EA':
    case 'TON':
    case 'LB':
    case 'HR':
    case 'DAY':
      return c
    case 'LF':
      return c * l
    case 'SF':
      return c * l * w
    case 'SY':
      return safeDiv(c * l * w, 9)
    case 'CF':
      return c * l * w * d
    case 'CY':
      return safeDiv(c * l * w * d, 27)
    case 'LS':
    case 'ALLOWANCE':
      return Math.max(c, 1)
    default:
      return c
  }
}

export interface EstimateItemInput {
  id: string
  sectionId: string | null
  sectionName?: string | null
  divisionCode: string | null
  divisionName?: string | null
  description: string
  drawingRef?: string | null
  measure: MeasureType
  count: number
  length: number
  width: number
  depth: number
  netQtyOverride: number | null
  uom: string | null
  wastePct: number
  laborClass: string | null
  laborHrsPerUnit: number
  laborRateOverride: number | null
  materialUnitCost: number
  equipmentUnitCost: number
  subUnitCost: number
  notes?: string | null
}

export interface EstimateFactors {
  laborBurdenPct: number
  salesTaxPct: number
  smallToolsPct: number
  laborRates: ReadonlyMap<string, number>
}

export interface EstimateItemDerived extends EstimateItemInput {
  netQty: number
  grossQty: number
  laborRate: number
  laborHours: number
  laborCost: number
  materialCost: number
  equipmentCost: number
  subCost: number
  totalCost: number
  unitCost: number
  qaFlags: string[]
}

/**
 * Prices one takeoff line.
 *
 * Workbook source: Takeoff ▸ L,O,P,R,T,V,W,X.
 *   L  Gross Qty        = Net Qty × (1 + Waste %)
 *   O  Rate             = INDEX/MATCH of Labor Class against the rate table
 *   P  Labor (burdened) = Gross Qty × hrs/unit × rate × (1 + Labor Burden %)
 *   R  Material (taxed) = Gross Qty × $/unit × (1 + Sales Tax %)
 *   T  Equipment        = Gross Qty × $/unit
 *   V  Subcontract      = Gross Qty × $/unit
 *   W  TOTAL            = P + R + T + V
 *   X  Check            = the QA flags reproduced in `qaFlags`
 */
export function deriveEstimateItem(
  item: EstimateItemInput,
  factors: EstimateFactors,
): EstimateItemDerived {
  const netQty = item.netQtyOverride != null ? num(item.netQtyOverride) : deriveNetQuantity(item)
  const grossQty = netQty * (1 + num(item.wastePct))

  const laborRate =
    item.laborRateOverride != null
      ? num(item.laborRateOverride)
      : num(item.laborClass ? factors.laborRates.get(item.laborClass) : 0)

  const laborHours = grossQty * num(item.laborHrsPerUnit)
  const laborCost = laborHours * laborRate * (1 + num(factors.laborBurdenPct))
  const materialCost = grossQty * num(item.materialUnitCost) * (1 + num(factors.salesTaxPct))
  const equipmentCost = grossQty * num(item.equipmentUnitCost)
  const subCost = grossQty * num(item.subUnitCost)
  const totalCost = laborCost + materialCost + equipmentCost + subCost

  const anyInput =
    num(item.count) + num(item.length) + num(item.width) + num(item.depth) +
    num(item.laborHrsPerUnit) + num(item.materialUnitCost) +
    num(item.equipmentUnitCost) + num(item.subUnitCost) !== 0

  const qaFlags: string[] = []
  if (anyInput) {
    if (!item.divisionCode) qaFlags.push('Missing CSI division')
    if (!item.measure) qaFlags.push('Missing measure')
    if (netQty <= 0) qaFlags.push('Quantity is zero')
    if (totalCost <= 0) qaFlags.push('No cost priced')
    if (num(item.laborHrsPerUnit) > 0 && !item.laborClass) qaFlags.push('Labor hours without a labor class')
    if (num(item.laborHrsPerUnit) > 0 && laborRate <= 0) qaFlags.push('Labor class has no rate')
  }

  return {
    ...item,
    netQty,
    grossQty,
    laborRate,
    laborHours,
    laborCost,
    materialCost,
    equipmentCost,
    subCost,
    totalCost,
    unitCost: safeDiv(totalCost, grossQty),
    qaFlags,
  }
}

export interface GeneralConditionInput {
  id: string
  item: string
  basis: string
  qty: number
  followsDuration: boolean
  unitCost: number
  notes?: string | null
}

/** GC quantities that follow duration re-derive from the estimate's week count. */
export function deriveGeneralCondition(gc: GeneralConditionInput, durationWeeks: number) {
  const qty = gc.followsDuration ? num(durationWeeks) : num(gc.qty)
  return { ...gc, qty, total: qty * num(gc.unitCost) }
}

export interface MarkupChainInput {
  directCost: number
  laborCost: number
  smallToolsPct: number
  contingencyPct: number
  overheadPct: number
  profitPct: number
  glInsurancePct: number
  bondPct: number
  exciseTaxPct: number
  roundToNearest: number
  /** Fixed dollar adders applied alongside the percentage chain. */
  fixedAdders?: { label: string; amount: number }[]
}

export interface MarkupStep {
  label: string
  basis: string
  rate: number | null
  amount: number
  runningTotal: number
  isSubtotal?: boolean
}

export interface BidBuildUp {
  steps: MarkupStep[]
  directCost: number
  smallTools: number
  contingency: number
  costSubtotal: number
  overhead: number
  profit: number
  subtotal: number
  glInsurance: number
  bond: number
  exciseTax: number
  fixedAdders: number
  totalBid: number
  roundedBid: number
  grossMarginOnBid: number
}

/**
 * The markup chain, compounded in the exact order the Bid Summary uses.
 *
 * Workbook source: Bid Summary ▸ G5:G16 and G22.
 *   Small tools  = labor × small-tools %
 *   Contingency  = (direct + small tools) × contingency %
 *   Cost subtotal= direct + small tools + contingency
 *   Overhead     = cost subtotal × overhead %
 *   Profit       = (cost subtotal + overhead) × profit %
 *   Subtotal     = cost subtotal + overhead + profit
 *   GL / bond / excise are each a percentage of that subtotal
 *   TOTAL BID    = subtotal + GL + bond + excise, then MROUND
 *   Gross margin = (total bid − cost subtotal) ÷ total bid
 *
 * Every step is returned so the UI can show precisely how the number was built.
 */
export function buildBidBuildUp(input: MarkupChainInput): BidBuildUp {
  const steps: MarkupStep[] = []
  const directCost = num(input.directCost)

  const smallTools = num(input.laborCost) * num(input.smallToolsPct)
  const contingency = (directCost + smallTools) * num(input.contingencyPct)
  const costSubtotal = directCost + smallTools + contingency
  const overhead = costSubtotal * num(input.overheadPct)
  const profit = (costSubtotal + overhead) * num(input.profitPct)
  const subtotal = costSubtotal + overhead + profit
  const glInsurance = subtotal * num(input.glInsurancePct)
  const bond = subtotal * num(input.bondPct)
  const exciseTax = subtotal * num(input.exciseTaxPct)
  const fixedAdders = sumBy(input.fixedAdders ?? [], (a) => a.amount)

  const totalBid = subtotal + glInsurance + bond + exciseTax + fixedAdders
  const roundedBid =
    num(input.roundToNearest) > 0 ? mround(totalBid, num(input.roundToNearest)) : totalBid

  let running = directCost
  steps.push({ label: 'Direct cost (takeoff + general conditions)', basis: 'Sum of priced lines', rate: null, amount: directCost, runningTotal: running })
  running += smallTools
  steps.push({ label: 'Small tools', basis: 'Labor cost', rate: num(input.smallToolsPct), amount: smallTools, runningTotal: running })
  running += contingency
  steps.push({ label: 'Contingency', basis: 'Direct + small tools', rate: num(input.contingencyPct), amount: contingency, runningTotal: running })
  steps.push({ label: 'Cost subtotal', basis: '—', rate: null, amount: costSubtotal, runningTotal: costSubtotal, isSubtotal: true })
  running = costSubtotal + overhead
  steps.push({ label: 'Overhead', basis: 'Cost subtotal', rate: num(input.overheadPct), amount: overhead, runningTotal: running })
  running += profit
  steps.push({ label: 'Profit', basis: 'Cost subtotal + overhead', rate: num(input.profitPct), amount: profit, runningTotal: running })
  steps.push({ label: 'Subtotal', basis: '—', rate: null, amount: subtotal, runningTotal: subtotal, isSubtotal: true })
  running = subtotal + glInsurance
  steps.push({ label: 'GL insurance', basis: 'Subtotal', rate: num(input.glInsurancePct), amount: glInsurance, runningTotal: running })
  running += bond
  steps.push({ label: 'P&P bond', basis: 'Subtotal', rate: num(input.bondPct), amount: bond, runningTotal: running })
  running += exciseTax
  steps.push({ label: 'B&O / excise tax', basis: 'Subtotal', rate: num(input.exciseTaxPct), amount: exciseTax, runningTotal: running })
  for (const adder of input.fixedAdders ?? []) {
    running += num(adder.amount)
    steps.push({ label: adder.label, basis: 'Fixed amount', rate: null, amount: num(adder.amount), runningTotal: running })
  }
  steps.push({ label: 'TOTAL BID', basis: '—', rate: null, amount: totalBid, runningTotal: totalBid, isSubtotal: true })

  return {
    steps,
    directCost,
    smallTools,
    contingency,
    costSubtotal,
    overhead,
    profit,
    subtotal,
    glInsurance,
    bond,
    exciseTax,
    fixedAdders,
    totalBid: money(totalBid),
    roundedBid: money(roundedBid),
    grossMarginOnBid: safeDiv(totalBid - costSubtotal, totalBid),
  }
}

export interface EstimateSummary {
  items: EstimateItemDerived[]
  gcItems: ReturnType<typeof deriveGeneralCondition>[]
  bySection: { key: string; label: string; amount: number; pctOfDirect: number }[]
  byDivision: { key: string; label: string; amount: number; pctOfDirect: number }[]
  costMix: { labor: number; material: number; equipment: number; subcontract: number }
  takeoffTotal: number
  gcTotal: number
  directCost: number
  laborCost: number
  laborHours: number
  buildUp: BidBuildUp
  metrics: {
    buildingAreaSf: number
    directCostPerSf: number
    totalBidPerSf: number
    laborShareOfDirect: number
    subShareOfDirect: number
  }
  qa: {
    flaggedItems: number
    pendingQuotes: number
    quoteVarianceRows: number
    unpricedGcItems: number
    issues: string[]
  }
}

export interface EstimateSummaryInput {
  items: EstimateItemInput[]
  gcItems: GeneralConditionInput[]
  factors: EstimateFactors
  durationWeeks: number
  buildingAreaSf: number
  markups: Omit<MarkupChainInput, 'directCost' | 'laborCost' | 'smallToolsPct'>
  smallToolsPct: number
  pendingQuotes: number
  quoteVarianceRows: number
}

export function summarizeEstimate(input: EstimateSummaryInput): EstimateSummary {
  const items = input.items.map((i) => deriveEstimateItem(i, input.factors))
  const gcItems = input.gcItems.map((g) => deriveGeneralCondition(g, input.durationWeeks))

  const takeoffTotal = sumBy(items, (i) => i.totalCost)
  const gcTotal = sumBy(gcItems, (g) => g.total)
  const directCost = takeoffTotal + gcTotal
  const laborCost = sumBy(items, (i) => i.laborCost)
  const laborHours = sumBy(items, (i) => i.laborHours)
  const subCost = sumBy(items, (i) => i.subCost)

  const group = (
    keyOf: (i: EstimateItemDerived) => { key: string; label: string } | null,
    extra?: { key: string; label: string; amount: number },
  ) => {
    const map = new Map<string, { key: string; label: string; amount: number }>()
    for (const item of items) {
      const g = keyOf(item)
      if (!g) continue
      const existing = map.get(g.key) ?? { ...g, amount: 0 }
      existing.amount += item.totalCost
      map.set(g.key, existing)
    }
    if (extra) map.set(extra.key, extra)
    return [...map.values()]
      .map((g) => ({ ...g, pctOfDirect: safeDiv(g.amount, directCost) }))
      .sort((a, b) => b.amount - a.amount)
  }

  const buildUp = buildBidBuildUp({
    ...input.markups,
    directCost,
    laborCost,
    smallToolsPct: input.smallToolsPct,
  })

  const flaggedItems = items.filter((i) => i.qaFlags.length > 0).length
  const unpricedGcItems = gcItems.filter((g) => g.item && g.total === 0).length

  const issues: string[] = []
  if (flaggedItems > 0) issues.push(`${flaggedItems} takeoff line${flaggedItems === 1 ? '' : 's'} flagged by QA`)
  if (input.pendingQuotes > 0) issues.push(`${input.pendingQuotes} subcontractor quote${input.pendingQuotes === 1 ? '' : 's'} still pending`)
  if (input.quoteVarianceRows > 0) issues.push(`${input.quoteVarianceRows} package${input.quoteVarianceRows === 1 ? '' : 's'} where the selected quote differs from the amount carried`)
  if (unpricedGcItems > 0) issues.push(`${unpricedGcItems} general-conditions item${unpricedGcItems === 1 ? '' : 's'} not priced`)

  return {
    items,
    gcItems,
    bySection: group(
      (i) => (i.sectionId ? { key: i.sectionId, label: i.sectionName ?? 'Section' } : null),
      { key: '__gc', label: 'General Conditions', amount: gcTotal },
    ),
    byDivision: group((i) =>
      i.divisionCode ? { key: i.divisionCode, label: `${i.divisionCode} ${i.divisionName ?? ''}`.trim() } : null,
    ),
    costMix: {
      labor: laborCost,
      material: sumBy(items, (i) => i.materialCost),
      equipment: sumBy(items, (i) => i.equipmentCost),
      subcontract: subCost,
    },
    takeoffTotal,
    gcTotal,
    directCost,
    laborCost,
    laborHours,
    buildUp,
    metrics: {
      buildingAreaSf: num(input.buildingAreaSf),
      directCostPerSf: safeDiv(directCost, num(input.buildingAreaSf)),
      totalBidPerSf: safeDiv(buildUp.totalBid, num(input.buildingAreaSf)),
      laborShareOfDirect: safeDiv(laborCost, directCost),
      subShareOfDirect: safeDiv(subCost, directCost),
    },
    qa: {
      flaggedItems,
      pendingQuotes: input.pendingQuotes,
      quoteVarianceRows: input.quoteVarianceRows,
      unpricedGcItems,
      issues,
    },
  }
}
