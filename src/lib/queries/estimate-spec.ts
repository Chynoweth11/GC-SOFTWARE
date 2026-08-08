import 'server-only'
import type { getEstimateBundle } from '@/lib/queries/estimate'
import type { SheetSpec } from '@/lib/excel'

/**
 * The definition of an estimate export: takeoff, general conditions, leveling
 * and the bid build-up. Excel and PDF both render from this one spec.
 */
export type EstimateBundle = NonNullable<Awaited<ReturnType<typeof getEstimateBundle>>>

export function buildEstimateSheets(bundle: EstimateBundle, showMarkups: boolean): SheetSpec[] {
  const { estimate, summary, packages } = bundle

  const sheets: SheetSpec[] = [
    {
      name: 'Takeoff',
      totalsRow: true,
      notes: [`${estimate.name} v${estimate.version}`, `${estimate.clientName ?? ''} · ${estimate.estimator ?? ''}`],
      columns: [
        { header: 'Section', key: 'section', width: 28 },
        { header: 'CSI division', key: 'division', width: 14 },
        { header: 'Item description', key: 'description', width: 40 },
        { header: 'Drawing ref', key: 'drawingRef', width: 14 },
        { header: 'Measure', key: 'measure', width: 10 },
        { header: 'Count', key: 'count', format: 'number' },
        { header: 'Length', key: 'length', format: 'number' },
        { header: 'Width', key: 'width', format: 'number' },
        { header: 'Depth', key: 'depth', format: 'number' },
        { header: 'Net qty', key: 'netQty', format: 'number' },
        { header: 'Waste %', key: 'wastePct', format: 'percent' },
        { header: 'Gross qty', key: 'grossQty', format: 'number' },
        { header: 'Labor class', key: 'laborClass', width: 14 },
        { header: 'Hrs / unit', key: 'laborHrsPerUnit', format: 'number' },
        { header: 'Rate', key: 'laborRate', format: 'money2' },
        { header: 'Labor hours', key: 'laborHours', format: 'number', total: true },
        { header: 'Labor $', key: 'laborCost', format: 'money', total: true },
        { header: 'Machine', key: 'equipmentClass', width: 16 },
        { header: 'Machine hours', key: 'equipmentHours', format: 'number', total: true },
        { header: 'Machine rate', key: 'equipmentRate', format: 'money2' },
        { header: 'Material $', key: 'materialCost', format: 'money', total: true },
        { header: 'Equipment $', key: 'equipmentCost', format: 'money', total: true },
        { header: 'Subcontract $', key: 'subCost', format: 'money', total: true },
        { header: 'Total $', key: 'totalCost', format: 'money', total: true },
        { header: 'QA flags', key: 'qaFlags', width: 36 },
      ],
      rows: summary.items.map((i) => ({
        section: i.sectionName ?? '',
        division: i.divisionCode ?? '',
        description: i.description,
        drawingRef: i.drawingRef ?? '',
        measure: i.measure,
        count: i.count,
        length: i.length,
        width: i.width,
        depth: i.depth,
        netQty: i.netQty,
        wastePct: i.wastePct,
        grossQty: i.grossQty,
        laborClass: i.laborClass ?? '',
        laborHrsPerUnit: i.laborHrsPerUnit,
        laborRate: i.laborRate,
        laborHours: i.laborHours,
        laborCost: i.laborCost,
        equipmentClass: i.equipmentClass ?? '',
        equipmentHours: i.equipmentHours,
        equipmentRate: i.equipmentRate,
        materialCost: i.materialCost,
        equipmentCost: i.equipmentCost,
        subCost: i.subCost,
        totalCost: i.totalCost,
        qaFlags: i.qaFlags.join('; '),
      })),
    },
    {
      name: 'General conditions',
      totalsRow: true,
      columns: [
        { header: 'Item', key: 'item', width: 32 },
        { header: 'Basis', key: 'basis', width: 10 },
        { header: 'Quantity', key: 'qty', format: 'number' },
        { header: 'Unit cost', key: 'unitCost', format: 'money2' },
        { header: 'Total', key: 'total', format: 'money', total: true },
        { header: 'Follows duration', key: 'followsDuration', width: 16 },
        { header: 'Notes', key: 'notes', width: 30 },
      ],
      rows: summary.gcItems.map((g) => ({
        item: g.item,
        basis: g.basis,
        qty: g.qty,
        unitCost: g.unitCost,
        total: g.total,
        followsDuration: g.followsDuration ? 'Yes' : 'No',
        notes: g.notes ?? '',
      })),
    },
    {
      name: 'Sub quote leveling',
      columns: [
        { header: 'Package', key: 'package', width: 26 },
        { header: 'Bidder', key: 'bidder', width: 26 },
        { header: 'Base bid', key: 'baseAmount', format: 'money' },
        { header: 'Leveling adjustment', key: 'adjustmentAmount', format: 'money' },
        { header: 'Leveled bid', key: 'leveledAmount', format: 'money' },
        { header: 'Low', key: 'isLow', width: 8 },
        { header: 'vs budget', key: 'varianceToBudget', format: 'money' },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Inclusions', key: 'inclusions', width: 34 },
        { header: 'Exclusions', key: 'exclusions', width: 34 },
        { header: 'Exceptions', key: 'flags', width: 40 },
      ],
      rows: packages.flatMap((p) =>
        p.quotes.map((q) => ({
          package: p.name,
          bidder: q.vendorName,
          baseAmount: q.baseAmount,
          adjustmentAmount: q.adjustmentAmount,
          leveledAmount: q.leveledAmount,
          isLow: q.isLow ? 'LOW' : '',
          varianceToBudget: q.varianceToBudget,
          status: q.status,
          inclusions: q.inclusions ?? '',
          exclusions: q.exclusions ?? '',
          flags: q.flags.join('; '),
        })),
      ),
    },
    {
      name: 'By division',
      totalsRow: true,
      columns: [
        { header: 'Division', key: 'label', width: 34 },
        { header: 'Amount', key: 'amount', format: 'money', total: true },
        { header: '% of direct', key: 'pctOfDirect', format: 'percent' },
      ],
      rows: summary.byDivision as unknown as Record<string, string | number>[],
    },
    ...(showMarkups
      ? [
          {
            name: 'Bid build-up',
            columns: [
              { header: 'Step', key: 'label', width: 40 },
              { header: 'Applied to', key: 'basis', width: 28 },
              { header: 'Rate', key: 'rate', format: 'percent' as const },
              { header: 'Amount', key: 'amount', format: 'money2' as const },
              { header: 'Running total', key: 'runningTotal', format: 'money2' as const },
            ],
            rows: [
              ...summary.buildUp.steps.map((s) => ({
                label: s.label,
                basis: s.basis,
                rate: s.rate ?? '',
                amount: s.amount,
                runningTotal: s.runningTotal,
              })),
              {
                label: `Rounded bid (nearest ${estimate.roundToNearest})`,
                basis: '',
                rate: '',
                amount: summary.buildUp.roundedBid,
                runningTotal: summary.buildUp.roundedBid,
              },
            ],
          },
        ]
      : []),
  ]


  return sheets
}
