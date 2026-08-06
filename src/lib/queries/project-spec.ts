import 'server-only'
import type { ProjectBundle } from '@/lib/queries/project'
import type { SheetSpec } from '@/lib/excel'
import type { WageSheetView } from '@/lib/queries/wage-rates'
import { titleize } from '@/lib/format'

/**
 * The definition of a full project export: every tab of the project workspace
 * as one set of sheets. The Excel workbook and the PDF both render from this,
 * so the two exports always carry the same figures.
 */
export function buildProjectSheets(
  bundle: ProjectBundle,
  showMargins: boolean,
  wageSheets: readonly WageSheetView[] = [],
): { sheets: SheetSpec[]; asOf: string } {
  const { project, financials: f, changeOrders, changeOrderRecords, commitments, cashFlow, quantities, bidPackages } = bundle
  const asOf = (project.dataDate ?? new Date()).toISOString().slice(0, 10)

  const summaryRows: { metric: string; value: number | string }[] = [
    { metric: 'Original contract sum', value: f.contract.originalContract },
    { metric: 'Approved change orders', value: f.contract.approvedChangeOrders },
    { metric: 'Current contract sum', value: f.contract.currentContract },
    { metric: 'Pending change orders', value: f.contract.pendingChangeOrders },
    { metric: 'Potential contract sum', value: f.contract.potentialContract },
    { metric: 'Original budget', value: f.originalBudget },
    { metric: 'Current budget', value: f.currentBudget },
    { metric: 'Committed', value: f.committed },
    { metric: 'Cost to date', value: f.costToDate },
    { metric: 'Accruals', value: f.accruals },
    { metric: 'Total cost to date', value: f.totalCostToDate },
    { metric: 'Budget at completion', value: f.earnedValue.budgetAtCompletion },
    { metric: 'Planned value', value: f.earnedValue.plannedValue },
    { metric: 'Earned value', value: f.earnedValue.earnedValue },
    { metric: 'Cost performance index', value: f.earnedValue.costPerformanceIndex },
    { metric: 'Schedule performance index', value: f.earnedValue.schedulePerformanceIndex },
    { metric: 'EAC, bottom-up', value: f.eac.bottomUp },
    { metric: 'EAC, CPI based', value: f.eac.cpiBased },
    { metric: 'EAC, budget rate', value: f.eac.budgetRate },
    { metric: `EAC, selected (${titleize(f.eac.method)})`, value: f.eac.selected },
    { metric: 'Estimate to complete', value: f.eac.estimateToComplete },
    { metric: 'Variance at completion', value: f.eac.varianceAtCompletion },
    ...(showMargins
      ? [
          { metric: 'Forecast profit', value: f.forecastProfit },
          { metric: 'Forecast margin', value: f.forecastMargin },
        ]
      : []),
    { metric: 'Percent complete', value: f.revenue.pctComplete },
    { metric: 'Revenue earned', value: f.revenue.revenueEarned },
    { metric: 'Billed to date', value: f.billing.totalCompletedAndStored },
    { metric: 'Collected', value: f.billing.amountCollected },
    { metric: 'Accounts receivable', value: f.billing.accountsReceivable },
    { metric: 'Retention receivable', value: f.retentionReceivable },
    { metric: 'Retention payable', value: f.retentionPayable },
    { metric: 'Accounts payable', value: f.accountsPayable },
    { metric: 'Overbilled', value: f.revenue.overbilled },
    { metric: 'Underbilled', value: f.revenue.underbilled },
    { metric: 'Backlog', value: f.backlog },
  ]

  const sheets: SheetSpec[] = [
    {
      name: 'Summary',
      notes: [`${project.number} ${project.name}`, `Data date ${asOf} · ${project.client?.name ?? 'No client'}`],
      columns: [
        { header: 'Metric', key: 'metric', width: 34 },
        { header: 'Value', key: 'value', format: 'money2', width: 20 },
      ],
      rows: summaryRows,
    },
    {
      name: 'Cost control',
      totalsRow: true,
      columns: [
        { header: 'Line item', key: 'code', width: 14 },
        { header: 'Description', key: 'description', width: 34 },
        { header: 'Cost type', key: 'category', width: 18 },
        { header: 'Trade', key: 'trade', width: 22 },
        { header: 'Original budget', key: 'originalBudget', format: 'money', total: true },
        { header: 'Revisions', key: 'budgetRevisions', format: 'money', total: true },
        { header: 'Current budget', key: 'currentBudget', format: 'money', total: true },
        { header: 'Committed', key: 'committed', format: 'money', total: true },
        { header: 'Cost to date', key: 'costToDate', format: 'money', total: true },
        { header: 'Accruals', key: 'accruals', format: 'money', total: true },
        { header: '% spent', key: 'pctSpent', format: 'percent' },
        { header: '% complete', key: 'pctComplete', format: 'percent' },
        { header: 'Earned value', key: 'earnedValue', format: 'money', total: true },
        { header: 'Cost variance', key: 'costVariance', format: 'money', total: true },
        { header: 'Remaining budget', key: 'remainingBudget', format: 'money', total: true },
        { header: 'Forecast to complete', key: 'forecastToComplete', format: 'money', total: true },
        { header: 'Forecast at completion', key: 'forecastAtCompletion', format: 'money', total: true },
        { header: 'FAC variance', key: 'facVariance', format: 'money', total: true },
      ],
      rows: f.lines.map((l) => ({
        code: l.code,
        description: l.description,
        category: titleize(l.category),
        trade: l.tradeName ?? '',
        originalBudget: l.originalBudget,
        budgetRevisions: l.budgetRevisions,
        currentBudget: l.currentBudget,
        committed: l.committed,
        costToDate: l.costToDate,
        accruals: l.accruals,
        pctSpent: l.pctSpent,
        pctComplete: l.effectivePctComplete,
        earnedValue: l.earnedValue,
        costVariance: l.costVariance,
        remainingBudget: l.remainingBudget,
        forecastToComplete: l.forecastToComplete,
        forecastAtCompletion: l.forecastAtCompletion,
        facVariance: l.facVariance,
      })),
    },
    {
      name: 'Commitments',
      totalsRow: true,
      columns: [
        { header: 'Number', key: 'number', width: 18 },
        { header: 'Type', key: 'type', width: 18 },
        { header: 'Vendor', key: 'vendor', width: 28 },
        { header: 'Original', key: 'original', format: 'money', total: true },
        { header: 'Approved changes', key: 'approvedChanges', format: 'money', total: true },
        { header: 'Pending changes', key: 'pendingChanges', format: 'money', total: true },
        { header: 'Current value', key: 'currentValue', format: 'money', total: true },
        { header: '% complete', key: 'pctComplete', format: 'percent' },
        { header: 'Invoiced', key: 'invoiced', format: 'money', total: true },
        { header: 'Paid', key: 'paid', format: 'money', total: true },
        { header: 'Retention', key: 'retention', format: 'money', total: true },
        { header: 'Outstanding', key: 'outstanding', format: 'money', total: true },
        { header: 'Balance to complete', key: 'balance', format: 'money', total: true },
        { header: 'Forecast final', key: 'forecastFinal', format: 'money', total: true },
      ],
      rows: commitments.map((c) => ({
        number: c.number,
        type: titleize(c.type),
        vendor: c.vendorName,
        original: c.originalAmount,
        approvedChanges: c.approvedChanges,
        pendingChanges: c.pendingChanges,
        currentValue: c.currentValue,
        pctComplete: c.pctComplete,
        invoiced: c.invoicedToDate,
        paid: c.paidToDate,
        retention: c.retentionHeld,
        outstanding: c.outstanding,
        balance: c.remainingBalance,
        forecastFinal: c.forecastFinalCost,
      })),
    },
    {
      name: 'Change orders',
      totalsRow: true,
      columns: [
        { header: 'Number', key: 'number', width: 14 },
        { header: 'Description', key: 'description', width: 40 },
        { header: 'Type', key: 'type', width: 20 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Owner amount', key: 'ownerAmount', format: 'money', total: true },
        { header: 'Cost amount', key: 'costAmount', format: 'money', total: true },
        ...(showMargins ? ([{ header: 'Margin', key: 'margin', format: 'money', total: true }] as const) : []),
        { header: 'Days pending', key: 'daysPending', format: 'number' },
        { header: 'Initiated', key: 'dateInitiated', format: 'date' },
        { header: 'Approved', key: 'dateApproved', format: 'date' },
      ],
      rows: changeOrders.map((co) => ({
        number: co.number,
        description: changeOrderRecords.find((r) => r.id === co.id)?.description ?? '',
        type: titleize(co.type),
        status: titleize(co.status),
        ownerAmount: co.ownerAmount,
        costAmount: co.costAmount,
        margin: co.margin,
        daysPending: co.daysPending,
        dateInitiated: co.dateInitiated,
        dateApproved: co.dateApproved,
      })),
    },
    {
      name: 'Cash flow',
      totalsRow: true,
      columns: [
        { header: 'Month end', key: 'periodEnd', format: 'date', width: 14 },
        { header: 'Actual or forecast', key: 'kind', width: 18 },
        { header: 'Planned delta %', key: 'plannedDeltaPct', format: 'percent' },
        { header: 'Planned cumulative %', key: 'plannedCumPct', format: 'percent' },
        { header: 'Planned value', key: 'plannedValue', format: 'money' },
        { header: 'Actual cost', key: 'actualCost', format: 'money', total: true },
        { header: 'Forecast cost', key: 'forecastCost', format: 'money', total: true },
        { header: 'Total cost', key: 'totalCost', format: 'money', total: true },
        { header: 'Cumulative cost', key: 'cumulativeCost', format: 'money' },
        { header: 'Billings', key: 'billings', format: 'money', total: true },
        { header: 'Cash in', key: 'cashIn', format: 'money', total: true },
        { header: 'Cumulative cash', key: 'cumulativeCash', format: 'money' },
        { header: 'Net cash', key: 'netCash', format: 'money' },
      ],
      rows: cashFlow.map((r) => ({
        periodEnd: r.periodEnd,
        kind: r.isActual ? 'Actual' : 'Forecast',
        plannedDeltaPct: r.plannedDeltaPct,
        plannedCumPct: r.plannedCumPct,
        plannedValue: r.plannedValue,
        actualCost: r.actualCost ?? 0,
        forecastCost: r.forecastCost,
        totalCost: r.totalCost,
        cumulativeCost: r.cumulativeCost,
        billings: r.billings,
        cashIn: r.cashIn,
        cumulativeCash: r.cumulativeCash,
        netCash: r.netCash,
      })),
    },
    ...(quantities.length > 0
      ? [
          {
            name: 'Quantities',
            totalsRow: true,
            columns: [
              { header: 'Work item', key: 'description', width: 32 },
              { header: 'Line item', key: 'costCode', width: 14 },
              { header: 'UOM', key: 'uom', width: 10 },
              { header: 'Budget qty', key: 'budgetQty', format: 'number' as const, total: true },
              { header: 'Installed', key: 'installedToDate', format: 'number' as const, total: true },
              { header: '% installed', key: 'pctInstalled', format: 'percent' as const },
              { header: 'Budget hours', key: 'budgetHours', format: 'number' as const, total: true },
              { header: 'Earned hours', key: 'earnedHours', format: 'number' as const, total: true },
              { header: 'Actual hours', key: 'actualHours', format: 'number' as const, total: true },
              { header: 'Productivity factor', key: 'productivityFactor', format: 'number' as const },
              { header: 'Forecast hours', key: 'forecastHoursAtCompletion', format: 'number' as const, total: true },
              { header: 'Days to complete', key: 'daysToComplete', format: 'number' as const },
            ],
            rows: quantities as unknown as Record<string, string | number>[],
          },
        ]
      : []),
    ...(bidPackages.length > 0
      ? [
          {
            name: 'Buyout',
            totalsRow: true,
            columns: [
              { header: 'Package', key: 'name', width: 28 },
              { header: 'Status', key: 'status', width: 14 },
              { header: 'Budget', key: 'budgetAmount', format: 'money' as const, total: true },
              { header: 'Low leveled bid', key: 'lowLeveled', format: 'money' as const, total: true },
              { header: 'Award', key: 'awardAmount', format: 'money' as const, total: true },
              { header: 'Savings', key: 'buyoutSavings', format: 'money' as const, total: true },
              { header: 'Bids received', key: 'receivedCount', format: 'number' as const },
              { header: 'Exceptions', key: 'flags', width: 40 },
            ],
            rows: bidPackages.map((p) => ({
              name: p.name,
              status: titleize(p.status),
              budgetAmount: p.budgetAmount,
              lowLeveled: p.lowLeveled,
              awardAmount: p.awardAmount,
              buyoutSavings: p.buyoutSavings,
              receivedCount: p.receivedCount,
              flags: p.flags.join('; '),
            })),
          },
        ]
      : []),

    /*
      One sheet per wage sheet, so a county's rates are never mixed with
      another county's. Every figure past the entered boxes is computed by the
      payroll engine here rather than read from the database, which is what
      keeps the workbook, the PDF and the screen in agreement.
    */
    ...wageSheets.map((wage) => ({
      name: `Wages ${wage.jurisdiction.code}${wage.county ? ` ${wage.county.name}` : ''}`.slice(0, 31),
      totalsRow: true,
      notes: [
        wage.name,
        `${wage.jurisdiction.name}${wage.county ? `, ${wage.county.name} County` : ''}` +
          (wage.rateScheduleDate ? `, schedule dated ${wage.rateScheduleDate.toISOString().slice(0, 10)}` : ', no schedule date'),
        wage.verifiedAt
          ? `Verified ${wage.verifiedAt.toISOString().slice(0, 10)}${wage.verifiedByName ? ` by ${wage.verifiedByName}` : ''}`
          : 'Not verified against the published schedule',
        `Federal unemployment ${(wage.rates.futaPct * 100).toFixed(3)} percent, social security and Medicare ${(wage.rates.ficaPct * 100).toFixed(3)} percent, state unemployment ${
          wage.rates.sutaSource === 'not set' ? 'not set' : `${(wage.rates.sutaPct * 100).toFixed(3)} percent from the ${wage.rates.sutaSource}`
        }`,
        'Percentage burdens are charged on the wage only. A fringe benefit is not wages.',
        ...wage.summary.issues,
      ],
      columns: [
        { header: 'Trade', key: 'trade', width: 34 },
        { header: 'Classification', key: 'classification', width: 18 },
        { header: '1 Hourly wage', key: 'hourlyWage', format: 'money2' as const, total: true },
        { header: '2 Hourly benefit', key: 'hourlyBenefits', format: 'money2' as const, total: true },
        { header: 'Subtotal', key: 'subtotal', format: 'money2' as const, total: true },
        { header: '3 FUTA', key: 'futa', format: 'money2' as const, total: true },
        { header: '4 FICA', key: 'fica', format: 'money2' as const, total: true },
        { header: '5 SUTA', key: 'suta', format: 'money2' as const, total: true },
        { header: '6 Training', key: 'training', format: 'money2' as const, total: true },
        { header: '7 Workers comp', key: 'workersComp', format: 'money2' as const, total: true },
        { header: 'Total burden', key: 'totalBurden', format: 'money2' as const, total: true },
        { header: 'Loaded hourly rate', key: 'total', format: 'money2' as const, total: true },
        { header: 'Burden of wage', key: 'burdenPctOfWage', format: 'percent' as const },
        { header: 'Overtime multiplier', key: 'overtimeMultiplier', format: 'number' as const },
        { header: 'Loaded overtime rate', key: 'overtimeTotal', format: 'money2' as const },
      ],
      rows: wage.summary.rows.map((row, index) => ({
        trade: row.trade,
        classification: wage.lines[index]?.classification ?? '',
        hourlyWage: row.hourlyWage,
        hourlyBenefits: row.hourlyBenefits,
        subtotal: row.subtotal,
        futa: row.futa,
        fica: row.fica,
        suta: row.suta,
        training: row.training,
        workersComp: row.workersComp,
        totalBurden: row.totalBurden,
        total: row.total,
        burdenPctOfWage: row.burdenPctOfWage,
        overtimeMultiplier: row.overtimeMultiplier,
        overtimeTotal: row.overtime.total,
      })),
    })),
  ]


  return { sheets, asOf }
}
