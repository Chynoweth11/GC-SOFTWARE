import { prisma } from '../src/lib/db'
import { getProjectBundle } from '../src/lib/queries/project'

async function main() {

  const counts = {
    projects: await prisma.project.count(),
    budgetLines: await prisma.budgetLine.count(),
    commitments: await prisma.commitment.count(),
    costTx: await prisma.costTransaction.count(),
    changeOrders: await prisma.changeOrder.count(),
    sovLines: await prisma.sovLine.count(),
    billings: await prisma.ownerBilling.count(),
    subInvoices: await prisma.subInvoice.count(),
    forecastLines: await prisma.forecastLine.count(),
    cashFlowPeriods: await prisma.cashFlowPeriod.count(),
    quantityItems: await prisma.quantityItem.count(),
    estimateItems: await prisma.estimateItem.count(),
    bidPackages: await prisma.bidPackage.count(),
    quotes: await prisma.bidPackageQuote.count(),
    bids: await prisma.bid.count(),
    vendors: await prisma.vendor.count(),
    costCodes: await prisma.costCode.count(),
  }
  console.log(counts)

  const company = await prisma.company.findFirstOrThrow()
  const p = await prisma.project.findFirstOrThrow({ where: { number: '26-001' } })
  const b = await getProjectBundle(p.id, company.id)
  if (!b) throw new Error('no bundle')
  const f = b.financials
  const fmt = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 0 })
  console.log('\n--- 26-001 vs workbook ---')
  console.log('Original contract   ', fmt(f.contract.originalContract), ' expect 2,450,000')
  console.log('Approved COs        ', fmt(f.contract.approvedChangeOrders), ' expect 68,000')
  console.log('Current contract    ', fmt(f.contract.currentContract), ' expect 2,518,000')
  console.log('Pending COs         ', fmt(f.contract.pendingChangeOrders), ' expect 78,200')
  console.log('Current budget      ', fmt(f.currentBudget), ' expect 1,799,700')
  console.log('Cost to date        ', fmt(f.totalCostToDate), ' expect 927,854')
  console.log('Earned value        ', fmt(f.earnedValue.earnedValue), ' expect 912,134')
  console.log('EAC (bottom-up)     ', fmt(f.eac.bottomUp), ' expect 1,815,420')
  console.log('EAC (CPI)           ', fmt(f.eac.cpiBased), ' expect 1,830,717')
  console.log('ETC                 ', fmt(f.eac.estimateToComplete), ' expect 887,566')
  console.log('Forecast profit     ', fmt(f.forecastProfit), ' expect 702,580')
  console.log('Forecast margin     ', (f.forecastMargin * 100).toFixed(1) + '%', ' expect 27.9%')
  console.log('Billed to date      ', fmt(f.billing.totalCompletedAndStored), ' expect 1,046,000')
  console.log('Committed           ', fmt(f.committed))
  console.log('Backlog             ', fmt(f.backlog), ' expect 1,472,000')
  console.log('Health              ', f.health.flag, f.health.scheduleStatus, f.health.budgetHealth)
  console.log('Alerts              ', b.alerts.length)
  console.log('Cash flow months    ', b.cashFlow.length)
  await prisma.$disconnect()

}

main()
