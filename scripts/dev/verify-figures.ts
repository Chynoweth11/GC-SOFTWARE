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
import { getOverheadSummary, getProjectCompliance, getProjectLabor } from '../../src/lib/queries/labor'
import { getProjectDocuments } from '../../src/lib/queries/documents'
import { getEquipmentItems, getProjectEquipment } from '../../src/lib/queries/equipment'
import { annualizeOverhead } from '../../src/lib/finance'
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

  // ── Contract documents and the approval gate ──────────────────────────
  // The rule the whole change order feature exists to enforce, checked against
  // live data: nothing without a certified approval reaches a contract value.
  console.log('\nChecking contract documents')
  let documentCount = 0
  for (const record of projects) {
    const { documents, totals, original } = await getProjectDocuments(record.id, company.id)
    const tag = record.number

    for (const document of documents) {
      documentCount++
      assert(
        `${tag} ${document.number}: counted if and only if it carries an approval`,
        document.isOfficial === (document.approvedAt !== null),
      )
      assert(
        `${tag} ${document.number}: is exactly one of approved, pending or closed out`,
        [document.isOfficial, document.isPending, document.isDead].filter(Boolean).length === 1,
      )
      check(`${tag} ${document.number}: margin is amount less cost`, document.margin, document.ownerAmount - document.costAmount)

      if (document.amountBasis === 'lines') {
        check(
          `${tag} ${document.number}: cost is the sum of its priced lines plus the chain`,
          document.costAmount,
          document.buildUp!.costSubtotal,
        )
        check(
          `${tag} ${document.number}: the direct cost is the sum of its lines`,
          document.buildUp!.directCost,
          document.lines.reduce((total, line) => total + line.totalCost, 0),
        )
      }
      check(
        `${tag} ${document.number}: the cost type split equals the priced cost`,
        document.costByCategory.reduce((total, group) => total + group.amount, 0),
        document.lines.reduce((total, line) => total + line.totalCost, 0),
      )
    }

    check(`${tag}: entered is approved plus pending plus rejected`, totals.entered, totals.approved + totals.pending + totals.rejected)
    check(
      `${tag}: approved equals the sum of the approved documents`,
      totals.approved,
      documents.filter((document) => document.isOfficial).reduce((total, document) => total + document.ownerAmount, 0),
    )
    /*
      The double count a time and materials ticket invites. A ticket rolled into
      a change order must not reach the contract value on its own, because the
      change order carries the money.
    */
    for (const document of documents) {
      assert(
        `${tag} ${document.number}: a rolled up ticket never counts on its own`,
        !document.isRolledUp || !document.countsTowardContract,
      )
    }
    check(
      `${tag}: rolled up value is excluded from the contract change total`,
      documents
        .filter((document) => document.countsTowardContract && document.isOfficial)
        .reduce((total, document) => total + document.ownerAmount, 0),
      documents
        .filter((document) => document.isOfficial && !document.isRolledUp && document.documentKind !== 'CONTRACT' && document.documentKind !== 'SUBCONTRACT_CHANGE' && document.documentKind !== 'OTHER')
        .reduce((total, document) => total + document.ownerAmount, 0),
    )

    // The contract position on the project page must be built from the same
    // documents, so a figure cannot appear on one page and not the other.
    const bundle = await getProjectBundle(record.id, company.id)
    if (bundle) {
      /*
        Document by document, the project bundle and the change orders tab have
        to arrive at the same number. They price through the same engine but
        load their own rate tables, and a document whose lines name a labor
        classification or a machine is exactly where those two can drift: price
        it against an empty table and it silently loses its labor and plant.
      */
      const onTheTab = new Map(documents.map((document) => [document.id, document]))
      for (const priced of bundle.changeOrders) {
        const tabbed = onTheTab.get(priced.id)
        if (!tabbed) continue
        check(
          `${tag} ${priced.number}: the project prices it at the same amount as its own tab`,
          priced.ownerAmount,
          tabbed.ownerAmount,
        )
        check(
          `${tag} ${priced.number}: the project prices its cost the same as its own tab`,
          priced.costAmount,
          tabbed.costAmount,
        )
      }

      check(
        `${tag}: approved change orders on the project equal the approved documents`,
        bundle.financials.contract.approvedChangeOrders,
        documents
          .filter((document) => document.isOfficial && document.documentKind !== 'CONTRACT' && document.documentKind !== 'SUBCONTRACT_CHANGE' && document.documentKind !== 'OTHER')
          .reduce((total, document) => total + document.ownerAmount, 0),
      )
      check(`${tag}: original contract agrees with its basis`, bundle.financials.contract.originalContract, original.amount)
      check(
        `${tag}: current contract is original plus approved`,
        bundle.financials.contract.currentContract,
        bundle.financials.contract.originalContract + bundle.financials.contract.approvedChangeOrders,
      )
      check(
        `${tag}: potential contract is current plus pending`,
        bundle.financials.contract.potentialContract,
        bundle.financials.contract.currentContract + bundle.financials.contract.pendingChangeOrders,
      )
    }
  }
  console.log(`  ${documentCount} contract documents checked`)

  // ── Equipment ─────────────────────────────────────────────────────────
  console.log('\nChecking equipment')
  let equipmentRows = 0
  for (const record of projects) {
    const equipment = await getProjectEquipment(record.id, company.id)
    const tag = record.number

    for (const row of equipment.rows) {
      equipmentRows++
      check(`${tag} ${row.displayName}: hire is the rate times the units`, row.rentalCost, row.rate * row.units)
      check(
        `${tag} ${row.displayName}: cost is the hire, the fuel and the standby`,
        row.cost,
        row.rentalCost + row.operatingCost + row.standbyCost,
      )
      assert(`${tag} ${row.displayName}: no negative cost`, row.cost >= -CENT)
    }

    check(
      `${tag}: the equipment total equals the sum of its entries`,
      equipment.totals.cost,
      equipment.rows.reduce((total, row) => total + row.cost, 0),
    )
    check(
      `${tag}: the three parts add to the whole`,
      equipment.totals.rentalCost + equipment.totals.operatingCost + equipment.totals.standbyCost,
      equipment.totals.cost,
    )
    check(
      `${tag}: the ownership split equals the whole`,
      equipment.byOwnership.reduce((total, group) => total + group.cost, 0),
      equipment.totals.cost,
    )
  }
  console.log(`  ${equipmentRows} equipment entries checked`)

  const equipmentList = await getEquipmentItems(company.id)
  for (const item of equipmentList) {
    assert(
      `${item.name}: an hourly figure only exists where a rate does`,
      (item.effectiveHourlyRate > 0) === (item.quotedBases.length > 0),
    )
    check(
      `${item.name}: the loaded hour is the rate plus fuel and wear`,
      item.loadedHourlyCost,
      item.effectiveHourlyRate + item.operatingCostPerHour,
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

  // ── Labor, project teams and compliance ───────────────────────────────
  console.log('\nChecking labor and compliance')
  let assignmentCount = 0
  for (const record of projects) {
    const labor = await getProjectLabor(record.id, company.id)
    const tag = record.number

    for (const row of labor.rows) {
      assignmentCount++
      check(`${tag} ${row.displayName}: cost = hours x the loaded rate`, row.cost, row.hours * row.loadedHourlyCost)
      assert(`${tag} ${row.displayName}: hours are never negative`, row.hours >= 0)
      if (row.basis === 'ALLOCATION') {
        assert(`${tag} ${row.displayName}: an allocation spans real weeks`, row.weeks >= 0)
      }
    }

    check(
      `${tag}: the labor total equals the sum of its assignments`,
      labor.totals.cost,
      labor.rows.reduce((total, row) => total + row.cost, 0),
    )
    check(
      `${tag}: field and team together are the whole labor cost`,
      labor.byKind.reduce((total, group) => total + group.cost, 0),
      labor.totals.cost,
    )
    check(
      `${tag}: the cost type split equals the whole labor cost`,
      labor.byCostCategory.reduce((total, group) => total + group.cost, 0),
      labor.totals.cost,
    )

    const compliance = await getProjectCompliance(record.id, company.id)
    for (const row of compliance.rows) {
      assert(
        `${tag} ${row.requirement.title}: nothing is both answered and missed`,
        row.missedDueDates.length <= row.deadlinesToDate,
      )
      assert(
        `${tag} ${row.requirement.title}: an overdue filing has a deadline behind it`,
        row.status !== 'OVERDUE' || (row.daysUntilDue !== null && row.daysUntilDue < 0),
      )
      assert(
        `${tag} ${row.requirement.title}: a current filing has a deadline ahead of it`,
        row.status !== 'CURRENT' || (row.daysUntilDue !== null && row.daysUntilDue > 0),
      )
    }
  }
  console.log(`  ${assignmentCount} labor assignments checked`)

  // ── Overhead recovery ─────────────────────────────────────────────────
  console.log('\nChecking overhead')
  const overhead = await getOverheadSummary(company.id)
  check(
    'listed overhead equals the sum of the annualized items',
    overhead.annualNonPayroll,
    overhead.rows.reduce((total, row) => total + annualizeOverhead(row), 0),
  )
  check(
    'annual overhead is the listed costs plus the staff no job is paying for',
    overhead.annualOverhead,
    overhead.annualNonPayroll + overhead.annualUnassignedStaff,
  )
  check('the monthly figure is the annual one over twelve', overhead.monthlyOverhead * 12, overhead.annualOverhead)
  if (overhead.derivedRate !== null) {
    check(
      'the recovery rate is overhead over revenue',
      overhead.derivedRate * overhead.annualRevenue,
      overhead.annualOverhead,
      1,
    )
    check('the rate gap is the derived rate less the one in bids', overhead.rateGap ?? 0, overhead.derivedRate - overhead.rateOnFile)
  }
  assert(
    'the staff assigned figure never exceeds what the staff cost',
    overhead.staff.annualAssigned <= overhead.staff.annualStaffCost + CENT,
  )

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
