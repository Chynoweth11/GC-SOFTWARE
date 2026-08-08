/**
 * Exports every project, restores each one, and exports it again.
 *
 * A backup that writes without an error is not the same as a backup that
 * carries the job. This proves the round trip: the second export has to match
 * the first field for field, and the restored project has to compute the same
 * financial position from the same engine. Anything the backup silently
 * dropped, a change order line's machine, a wage sheet, a compliance filing,
 * shows up here as a difference rather than as a surprise a year from now.
 *
 * The restored projects are deleted at the end, so this leaves nothing behind.
 */
import { prisma } from '../../src/lib/db'
import { exportProject, restoreProject, type ProjectBackup } from '../../src/lib/backup'
import { getProjectBundle } from '../../src/lib/queries/project'

let failures = 0
const fail = (message: string) => {
  failures++
  console.log(`  FAIL  ${message}`)
}

/**
 * The fields that are expected to differ between the two exports, and nothing
 * else. The number changes because a restore never overwrites, and the
 * timestamp changes because the two files were written seconds apart.
 */
function normalize(document: ProjectBackup, sourceNumber: string): string {
  const copy = JSON.parse(JSON.stringify(document)) as ProjectBackup
  copy.exportedAt = ''
  ;(copy.project as Record<string, unknown>).number = sourceNumber
  return JSON.stringify(copy, Object.keys(copy).sort())
}

/** Where two otherwise matching documents first part company. */
function firstDifference(left: unknown, right: unknown, path = ''): string | null {
  if (left === right) return null
  if (typeof left !== typeof right) return `${path || 'root'}: ${typeof left} against ${typeof right}`
  if (left === null || right === null || typeof left !== 'object') {
    return `${path || 'root'}: ${JSON.stringify(left)} against ${JSON.stringify(right)}`
  }
  if (Array.isArray(left) !== Array.isArray(right)) return `${path}: one is a list and one is not`
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return `${path}: ${left.length} entries against ${right.length}`
    for (let index = 0; index < left.length; index++) {
      const difference = firstDifference(left[index], right[index], `${path}[${index}]`)
      if (difference) return difference
    }
    return null
  }
  const leftKeys = Object.keys(left as object).sort()
  const rightKeys = Object.keys(right as object).sort()
  if (leftKeys.join(',') !== rightKeys.join(',')) {
    return `${path}: fields ${leftKeys.join(', ')} against ${rightKeys.join(', ')}`
  }
  for (const key of leftKeys) {
    const difference = firstDifference(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
      path ? `${path}.${key}` : key,
    )
    if (difference) return difference
  }
  return null
}

/**
 * Puts one of everything the backup carries onto a job, so the round trip has
 * something to prove.
 *
 * The seeded jobs have no wage sheet, no team, no plant and no filings, so
 * without this the new parts of the backup would round trip empty arrays and
 * report success. Everything made here is torn down at the end.
 */
async function buildFixture(companyId: string) {
  // A job that already carries a change order, so the ticket has something
  // real to be billed under and the roll up is actually exercised.
  const project = await prisma.project.findFirstOrThrow({
    where: { companyId, changeOrders: { some: { documentKind: 'CHANGE_ORDER' } } },
    orderBy: { number: 'asc' },
    select: { id: true, number: true },
  })
  const costCode = await prisma.costCode.findFirstOrThrow({ where: { companyId } })
  const jurisdiction = await prisma.payrollJurisdiction.findFirst({ where: { companyId, code: 'WA' } })

  const machine = await prisma.equipmentItem.create({
    data: {
      companyId,
      name: 'Round trip excavator',
      category: 'Earthmoving',
      ownership: 'RENTED',
      dailyRate: 1_200,
      weeklyRate: 4_500,
      operatingCostPerHour: 45,
      standbyRatePerHour: 300,
    },
  })

  const classification = await prisma.laborClassification.create({
    data: {
      companyId,
      name: 'Round trip superintendent',
      kind: 'FIELD',
      payBasis: 'SALARY',
      baseAmount: 132_000,
      benefitsAmount: 24_000,
      annualHours: 2_080,
      workersCompRate: 0.42,
      jurisdictionId: jurisdiction?.id ?? null,
    },
  })

  await prisma.projectLaborAssignment.create({
    data: {
      projectId: project.id,
      classificationId: classification.id,
      label: 'Round trip person',
      costCodeId: costCode.id,
      basis: 'ALLOCATION',
      allocationPct: 0.5,
      startDate: new Date('2026-03-01'),
      endDate: new Date('2026-08-31'),
    },
  })

  await prisma.projectEquipmentAssignment.create({
    data: {
      projectId: project.id,
      equipmentItemId: machine.id,
      costCodeId: costCode.id,
      basis: 'DAILY',
      units: 10,
      operatingHours: 60,
      standbyHours: 4,
      startDate: new Date('2026-04-01'),
      endDate: new Date('2026-04-14'),
    },
  })

  if (jurisdiction) {
    await prisma.wageRateSheet.create({
      data: {
        projectId: project.id,
        name: 'Round trip wage sheet',
        jurisdictionId: jurisdiction.id,
        determinationRef: 'Round trip determination',
        lines: {
          create: [
            {
              trade: 'Carpenter, journey level',
              hourlyWage: 48.32,
              hourlyBenefits: 18.4,
              trainingPerHour: 0.7,
              workersCompPerHour: 1.05,
            },
          ],
        },
      },
    })
  }

  const requirement = await prisma.complianceRequirement.create({
    data: {
      projectId: project.id,
      kind: 'CERTIFIED_PAYROLL',
      title: 'Round trip certified payroll',
      agency: 'Round trip agency',
      frequency: 'WEEKLY',
      firstDueDate: new Date('2026-03-06'),
      leadDays: 5,
    },
  })
  await prisma.complianceSubmission.create({
    data: {
      requirementId: requirement.id,
      dueDate: new Date('2026-03-06'),
      submittedAt: new Date('2026-03-05'),
      reference: 'RT-0001',
    },
  })

  // A ticket priced off the machine, billed under a change order. Both the
  // named machine and the roll up are new to the backup, and losing either
  // would change what the job is worth.
  const parent = await prisma.changeOrder.findFirstOrThrow({
    where: { projectId: project.id, documentKind: 'CHANGE_ORDER' },
    select: { id: true, number: true },
  })
  const ticket = await prisma.changeOrder.create({
    data: {
      projectId: project.id,
      number: 'RT-TM-1',
      description: 'Round trip time and materials ticket',
      documentKind: 'TIME_AND_MATERIALS',
      status: 'FULLY_SIGNED',
      priceFromLines: true,
      profitPct: 0,
      overheadPct: 0,
      rollsUpToId: parent.id,
      lines: {
        create: [
          {
            costCodeId: costCode.id,
            category: 'EQUIPMENT',
            description: 'Excavator and operator, one day',
            measure: 'LS',
            count: 1,
            equipmentClass: machine.name,
            equipmentHrsPerUnit: 8,
            otherUnitCost: 440,
          },
        ],
      },
      signatures: { create: [{ party: 'Owner representative', role: 'Owner', status: 'SIGNED' }] },
    },
  })

  return {
    projectId: project.id,
    projectNumber: project.number,
    parentNumber: parent.number,
    machineId: machine.id,
    classificationId: classification.id,
    ticketId: ticket.id,
  }
}

async function tearDownFixture(fixture: Awaited<ReturnType<typeof buildFixture>>) {
  await prisma.changeOrder.delete({ where: { id: fixture.ticketId } })
  await prisma.wageRateSheet.deleteMany({ where: { projectId: fixture.projectId, name: 'Round trip wage sheet' } })
  await prisma.complianceRequirement.deleteMany({
    where: { projectId: fixture.projectId, title: 'Round trip certified payroll' },
  })
  await prisma.projectEquipmentAssignment.deleteMany({ where: { equipmentItemId: fixture.machineId } })
  await prisma.projectLaborAssignment.deleteMany({ where: { classificationId: fixture.classificationId } })
  await prisma.equipmentItem.delete({ where: { id: fixture.machineId } })
  await prisma.laborClassification.delete({ where: { id: fixture.classificationId } })
}

async function main() {
  const company = await prisma.company.findFirstOrThrow()
  const owner = await prisma.user.findFirstOrThrow({ where: { companyId: company.id, role: 'OWNER' } })

  const fixture = await buildFixture(company.id)
  console.log(
    `${fixture.projectNumber} carries a wage sheet, a team, plant, filings and a ticket billed under ${fixture.parentNumber}\n`,
  )

  const projects = await prisma.project.findMany({
    where: { companyId: company.id },
    select: { id: true, number: true, name: true },
    orderBy: { number: 'asc' },
  })

  console.log(`Round tripping ${projects.length} projects\n`)
  const restoredIds: string[] = []

  for (const project of projects) {
    const before = await exportProject(project.id, company.id)
    if (!before) {
      fail(`${project.number}: would not export`)
      continue
    }

    const result = await restoreProject(before, { id: owner.id, companyId: company.id })
    if (result.error || !result.projectId) {
      fail(`${project.number}: would not restore, ${result.error ?? 'no project came back'}`)
      continue
    }
    restoredIds.push(result.projectId)

    const after = await exportProject(result.projectId, company.id)
    if (!after) {
      fail(`${project.number}: the restored project would not export`)
      continue
    }

    const difference = firstDifference(
      JSON.parse(normalize(before, project.number)),
      JSON.parse(normalize(after, project.number)),
    )
    if (difference) {
      fail(`${project.number}: the round trip changed the backup at ${difference}`)
    }

    // The restored project has to reach the same position through the engine,
    // not just hold the same stored values.
    const [source, restored] = await Promise.all([
      getProjectBundle(project.id, company.id),
      getProjectBundle(result.projectId, company.id),
    ])
    if (!source || !restored) {
      fail(`${project.number}: a bundle would not load`)
      continue
    }

    const figures: [string, number, number][] = [
      ['original contract', source.financials.contract.originalContract, restored.financials.contract.originalContract],
      ['approved changes', source.financials.contract.approvedChangeOrders, restored.financials.contract.approvedChangeOrders],
      ['current contract', source.financials.contract.currentContract, restored.financials.contract.currentContract],
      ['pending changes', source.financials.contract.pendingChangeOrders, restored.financials.contract.pendingChangeOrders],
      ['original budget', source.financials.originalBudget, restored.financials.originalBudget],
      ['current budget', source.financials.currentBudget, restored.financials.currentBudget],
      ['committed', source.financials.committed, restored.financials.committed],
      ['cost to date', source.financials.costToDate, restored.financials.costToDate],
      ['accruals', source.financials.accruals, restored.financials.accruals],
      ['earned value', source.financials.earnedValue.earnedValue, restored.financials.earnedValue.earnedValue],
      ['cost performance index', source.financials.earnedValue.costPerformanceIndex, restored.financials.earnedValue.costPerformanceIndex],
      ['estimate at completion', source.financials.eac.selected, restored.financials.eac.selected],
      ['estimate to complete', source.financials.eac.estimateToComplete, restored.financials.eac.estimateToComplete],
      ['forecast cost', source.financials.forecastCost, restored.financials.forecastCost],
      ['forecast profit', source.financials.forecastProfit, restored.financials.forecastProfit],
      ['forecast margin', source.financials.forecastMargin, restored.financials.forecastMargin],
      ['billed to date', source.financials.billing.totalCompletedAndStored, restored.financials.billing.totalCompletedAndStored],
      ['retainage held', source.financials.billing.retainageHeld, restored.financials.billing.retainageHeld],
      ['accounts receivable', source.financials.billing.accountsReceivable, restored.financials.billing.accountsReceivable],
      ['backlog', source.financials.backlog, restored.financials.backlog],
      ['health score', source.financials.health.score, restored.financials.health.score],
    ]
    for (const [label, was, now] of figures) {
      if (Math.abs(was - now) > 0.005) {
        fail(`${project.number}: ${label} restored as ${now} against ${was}`)
      }
    }

    const counts = Object.entries(result.created)
      .map(([key, value]) => `${value} ${key}`)
      .join(', ')
    console.log(`  ok    ${project.number} ${project.name}`)
    console.log(`        ${counts}`)
    if (result.warnings.length > 0) {
      for (const warning of result.warnings.slice(0, 3)) console.log(`        note: ${warning}`)
    }
  }

  // Leave nothing behind. These were only ever made to be compared.
  for (const id of restoredIds) await prisma.project.delete({ where: { id } })
  await tearDownFixture(fixture)
  console.log(`\n  ${restoredIds.length} restored projects and the fixture removed`)

  console.log('\n' + '='.repeat(70))
  console.log(`${projects.length} projects round tripped, ${failures} failures`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
