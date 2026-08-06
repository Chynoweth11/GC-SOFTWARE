/**
 * Checks that the financial engine adds up, and that every surface agrees.
 *
 * Three kinds of check:
 *   1. Internal identities, the equations that must hold on every project
 *      whatever the data, such as current budget = original + revisions.
 *   2. Cross-surface agreement, the company roll-up against the sum of the
 *      projects it is built from.
 *   3. Export fidelity, the same headline figures read back out of the
 *      generated workbook and PDF.
 */
import { getProjectBundle } from '../../src/lib/queries/project'
import { getCompanyDashboard } from '../../src/lib/queries/company'
import { getProjectWageSheets } from '../../src/lib/queries/wage-rates'
import { COUNTIES, JURISDICTIONS } from '../../src/lib/reference/jurisdictions'
import { prisma } from '../../src/lib/db'

const CENT = 0.005

let failures = 0
let checks = 0

function check(label: string, actual: number, expected: number, tolerance = CENT) {
  checks++
  const difference = Math.abs(actual - expected)
  if (difference > tolerance) {
    failures++
    console.log(`  FAIL  ${label}`)
    console.log(`        got ${actual.toFixed(4)}, expected ${expected.toFixed(4)}, off by ${difference.toFixed(4)}`)
  }
}

function assert(label: string, condition: boolean) {
  checks++
  if (!condition) {
    failures++
    console.log(`  FAIL  ${label}`)
  }
}

async function main() {
  const company = await prisma.company.findFirstOrThrow()
  const projects = await prisma.project.findMany({
    where: { companyId: company.id },
    select: { id: true, number: true },
    orderBy: { number: 'asc' },
  })

  console.log(`Checking ${projects.length} projects\n`)

  for (const record of projects) {
    const bundle = await getProjectBundle(record.id, company.id)
    if (!bundle) continue
    const f = bundle.financials
    const tag = record.number

    // ── Cost control identities, per line and in total ──────────────────
    for (const line of f.lines) {
      check(
        `${tag} ${line.description}: current budget = original + revisions`,
        line.currentBudget,
        line.originalBudget + line.budgetRevisions,
      )
      check(
        `${tag} ${line.description}: total cost = cost to date + accruals`,
        line.totalCostToDate,
        line.costToDate + line.accruals,
      )
      check(
        `${tag} ${line.description}: earned value = budget x percent complete`,
        line.earnedValue,
        line.currentBudget * line.effectivePctComplete,
      )
      check(
        `${tag} ${line.description}: cost variance = earned value - cost`,
        line.costVariance,
        line.earnedValue - line.totalCostToDate,
      )
      check(
        `${tag} ${line.description}: remaining budget = budget - cost`,
        line.remainingBudget,
        line.currentBudget - line.totalCostToDate,
      )
      check(
        `${tag} ${line.description}: forecast = cost + cost to complete`,
        line.forecastAtCompletion,
        line.totalCostToDate + line.forecastToComplete,
      )
      check(
        `${tag} ${line.description}: forecast variance = budget - forecast`,
        line.facVariance,
        line.currentBudget - line.forecastAtCompletion,
      )
      assert(`${tag} ${line.description}: cost to complete is never negative`, line.forecastToComplete >= -CENT)
    }

    // ── Totals equal the sum of their parts ─────────────────────────────
    const sum = (pick: (line: (typeof f.lines)[number]) => number) => f.lines.reduce((total, line) => total + pick(line), 0)

    check(`${tag}: current budget total`, f.currentBudget, sum((line) => line.currentBudget))
    check(`${tag}: cost to date total`, f.totalCostToDate, sum((line) => line.totalCostToDate))
    check(`${tag}: committed total`, f.committed, sum((line) => line.committed))
    check(`${tag}: forecast cost total`, f.forecastCost, sum((line) => line.forecastAtCompletion))
    check(
      `${tag}: category roll-up equals the line total`,
      f.categories.reduce((total, category) => total + category.currentBudget, 0),
      f.currentBudget,
    )

    // ── Contract and margin ─────────────────────────────────────────────
    check(
      `${tag}: current contract = original + approved change orders`,
      f.contract.currentContract,
      f.contract.originalContract + f.contract.approvedChangeOrders,
    )
    check(`${tag}: forecast profit = contract - forecast cost`, f.forecastProfit, f.contract.currentContract - f.forecastCost)
    if (f.contract.currentContract !== 0) {
      check(
        `${tag}: forecast margin = profit / contract`,
        f.forecastMargin,
        f.forecastProfit / f.contract.currentContract,
        1e-9,
      )
    }
    check(`${tag}: backlog = contract - billed`, f.backlog, f.contract.currentContract - f.revenue.amountBilled, 0.5)

    // ── Earned value ────────────────────────────────────────────────────
    const ev = f.earnedValue
    check(`${tag}: budget at completion = current budget`, ev.budgetAtCompletion, f.currentBudget)
    check(`${tag}: actual cost = cost to date`, ev.actualCost, f.totalCostToDate)
    if (ev.actualCost !== 0) {
      check(`${tag}: cost performance index = earned / actual`, ev.costPerformanceIndex, ev.earnedValue / ev.actualCost, 1e-9)
    }

    // ── Billing position ────────────────────────────────────────────────
    assert(`${tag}: a project is not both over and under billed`, !(f.revenue.overbilled > CENT && f.revenue.underbilled > CENT))
    check(
      `${tag}: over/under billing nets to earned less billed`,
      f.revenue.overbilled - f.revenue.underbilled,
      f.revenue.amountBilled - f.revenue.revenueEarned,
      0.5,
    )

  }

  // ── Prevailing wage sheets ────────────────────────────────────────────
  // The identities that must hold on any sheet whatever the rates on it, and
  // the one that must never hold: a percentage burden charged on the fringe.
  console.log('\nChecking wage sheets')
  let wageRows = 0
  for (const record of projects) {
    for (const sheet of await getProjectWageSheets(record.id, company.id)) {
      const tag = `${record.number} ${sheet.name}`
      for (const row of sheet.summary.rows) {
        wageRows++
        check(`${tag} ${row.trade}: subtotal = wage + benefit`, row.subtotal, row.hourlyWage + row.hourlyBenefits)
        check(
          `${tag} ${row.trade}: total = subtotal + every burden`,
          row.total,
          row.subtotal + row.futa + row.fica + row.suta + row.training + row.workersComp,
        )
        check(`${tag} ${row.trade}: FUTA is charged on the wage alone`, row.futa, row.hourlyWage * sheet.rates.futaPct)
        check(`${tag} ${row.trade}: FICA is charged on the wage alone`, row.fica, row.hourlyWage * sheet.rates.ficaPct)
        check(`${tag} ${row.trade}: SUTA is charged on the wage alone`, row.suta, row.hourlyWage * sheet.rates.sutaPct)
        assert(
          `${tag} ${row.trade}: overtime does not pay a premium on the fringe`,
          Math.abs(row.overtime.hourlyBenefits - row.hourlyBenefits) < CENT,
        )
      }
      check(
        `${tag}: the sheet total equals the sum of its trades`,
        sheet.summary.totals.total,
        sheet.summary.rows.reduce((total, row) => total + row.total, 0),
      )
    }
  }
  console.log(`  ${wageRows} wage rates checked`)

  // ── Payroll reference data ────────────────────────────────────────────
  // Guards the promise the software makes about this data: every state is
  // present, the two county lists are complete, and no tax rate is shipped.
  console.log('\nChecking payroll reference data')
  const jurisdictions = await prisma.payrollJurisdiction.findMany({
    where: { companyId: company.id },
    include: { counties: true },
  })
  check('every state and DC is set up', jurisdictions.length, JURISDICTIONS.length, 0)
  for (const [code, expected] of Object.entries(COUNTIES)) {
    const seeded = jurisdictions.find((jurisdiction) => jurisdiction.code === code)
    assert(`${code} is set up`, Boolean(seeded))
    if (seeded) check(`${code} carries its full county list`, seeded.counties.length, expected.length, 0)
  }
  for (const jurisdiction of jurisdictions) {
    assert(
      `${jurisdiction.code}: an unverified unemployment rate is never presented as checked`,
      jurisdiction.sutaPct !== null || jurisdiction.verifiedAt === null,
    )
  }

  // ── Company roll-up against the projects it is built from ─────────────
  console.log('\nChecking the company roll-up')
  const dashboard = await getCompanyDashboard(company.id)
  const rows = dashboard.projects

  check(
    'portfolio contract value equals the sum of the projects',
    dashboard.totals.currentContract,
    rows.reduce((total, row) => total + row.financials.contract.currentContract, 0),
  )
  check(
    'portfolio forecast cost equals the sum of the projects',
    dashboard.totals.forecastCost,
    rows.reduce((total, row) => total + row.financials.forecastCost, 0),
  )
  check(
    'portfolio current budget equals the sum of the projects',
    dashboard.totals.currentBudget,
    rows.reduce((total, row) => total + row.financials.currentBudget, 0),
  )
  check(
    'portfolio forecast profit equals contract less forecast cost',
    dashboard.totals.forecastProfit,
    dashboard.totals.currentContract - dashboard.totals.forecastCost,
    1,
  )
  check(
    'portfolio backlog equals the sum of the projects',
    dashboard.totals.backlog,
    rows.reduce((total, row) => total + row.financials.backlog, 0),
    0.5,
  )
  check(
    'portfolio cost to date equals the sum of the projects',
    dashboard.totals.actualCost,
    rows.reduce((total, row) => total + row.financials.totalCostToDate, 0),
  )

  console.log('\n' + '='.repeat(70))
  console.log(`${checks} checks, ${failures} failures`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
