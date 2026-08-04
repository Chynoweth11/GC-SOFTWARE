'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { assertCan } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { defaultCurve, safeDiv } from '@/lib/finance'
import type { CostCategory, MeasureType } from '@/generated/prisma/client'

function parseDate(value: FormDataEntryValue | null): Date | null {
  const raw = String(value ?? '')
  if (!raw) return null
  const parsed = new Date(`${raw}T00:00:00.000Z`)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Converts an awarded estimate into a live project.
 *
 * Everything the estimator built becomes the project's opening position: the
 * bid becomes the contract value, each trade section becomes a budget line on a
 * line item, the labour/material/equipment/subcontract split is preserved, and
 * a planned progress curve is generated across the contract dates. The estimate
 * itself is locked, so the basis of the bid is never edited after award.
 */
export async function convertEstimateToProject(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'award:bid')

  const estimateId = String(formData.get('estimateId'))
  const number = String(formData.get('number') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const contractSum = Number(formData.get('originalContractSum'))

  if (!number) return { error: 'Enter a job number.' }
  if (!name) return { error: 'Enter a project name.' }
  if (!isFinite(contractSum) || contractSum <= 0) return { error: 'Enter the contract value.' }

  const bundle = await getEstimateBundle(estimateId, user.companyId)
  if (!bundle) return { error: 'Estimate not found.' }
  if (bundle.estimate.projects.length > 0) return { error: 'This estimate has already been converted.' }

  const clash = await prisma.project.findFirst({ where: { companyId: user.companyId, number } })
  if (clash) return { error: `Job number ${number} is already in use.` }

  const contractStart = parseDate(formData.get('contractStart')) ?? new Date()
  const contractCompletion =
    parseDate(formData.get('contractCompletion')) ??
    new Date(contractStart.getTime() + bundle.estimate.durationWeeks * 7 * 86_400_000)

  const company = await prisma.company.findUniqueOrThrow({ where: { id: user.companyId } })

  // Line items are created per trade section and cost category, so the budget
  // carries the estimator's own structure rather than a generic template.
  const { summary } = bundle
  const categoryTotals = new Map<string, { section: string; category: CostCategory; amount: number }>()

  for (const item of summary.items) {
    const section = item.sectionName ?? 'Unassigned'
    const buckets: [CostCategory, number][] = [
      ['LABOR', item.laborCost],
      ['MATERIAL', item.materialCost],
      ['EQUIPMENT', item.equipmentCost],
      ['SUBCONTRACT', item.subCost],
    ]
    for (const [category, amount] of buckets) {
      if (amount <= 0) continue
      const key = `${section}|${category}`
      const entry = categoryTotals.get(key) ?? { section, category, amount: 0 }
      entry.amount += amount
      categoryTotals.set(key, entry)
    }
  }
  if (summary.gcTotal > 0) {
    categoryTotals.set('General Conditions|GENERAL_CONDITIONS', {
      section: 'General Conditions',
      category: 'GENERAL_CONDITIONS',
      amount: summary.gcTotal,
    })
  }
  // Contingency and overhead carried in the markup chain become budget lines too,
  // so the project budget reconciles to the bid rather than only to direct cost.
  if (summary.buildUp.contingency > 0) {
    categoryTotals.set('Contingency|CONTINGENCY', { section: 'Contingency', category: 'CONTINGENCY', amount: summary.buildUp.contingency })
  }
  if (summary.buildUp.overhead > 0) {
    categoryTotals.set('Overhead|OVERHEAD', { section: 'Overhead', category: 'OVERHEAD', amount: summary.buildUp.overhead })
  }

  const project = await prisma.project.create({
    data: {
      companyId: user.companyId,
      number,
      name,
      clientId: String(formData.get('clientId') ?? '') || null,
      address: bundle.estimate.address,
      projectType: bundle.estimate.projectType,
      architect: bundle.estimate.architect,
      pmUserId: String(formData.get('pmUserId') ?? '') || null,
      status: 'AWARDED',
      noticeToProceed: contractStart,
      contractStart,
      contractCompletion,
      forecastCompletion: contractCompletion,
      dataDate: contractStart,
      originalContractSum: contractSum,
      ownerRetentionPct: company.defaultRetentionPct,
      defaultSubRetentionPct: company.defaultRetentionPct,
      targetMarginPct: summary.buildUp.grossMarginOnBid,
      laborBurdenPct: bundle.estimate.laborBurdenPct,
      overheadPct: bundle.estimate.overheadPct,
      sourceEstimateId: estimateId,
      sourceBidId: bundle.estimate.bidId,
      notes: `Converted from estimate "${bundle.estimate.name}" v${bundle.estimate.version}.`,
    },
  })

  // Budget lines, on line items created or reused per section and category.
  const codePrefix: Record<CostCategory, string> = {
    LABOR: 'L', MATERIAL: 'M', EQUIPMENT: 'E', SUBCONTRACT: 'S',
    GENERAL_CONDITIONS: 'G', OVERHEAD: 'O', CONTINGENCY: 'C', OTHER: 'X',
  }

  let sortOrder = 0
  const sovInputs: { description: string; amount: number }[] = []

  for (const entry of [...categoryTotals.values()].sort((a, b) => b.amount - a.amount)) {
    const slug = entry.section
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 22)
      .toUpperCase()
    const code = `${slug}-${codePrefix[entry.category]}`

    const trade = await prisma.trade.findFirst({ where: { companyId: user.companyId, name: entry.section } })

    const costCode = await prisma.costCode.upsert({
      where: { companyId_code: { companyId: user.companyId, code } },
      create: {
        companyId: user.companyId,
        code,
        description: `${entry.section}, ${entry.category.toLowerCase().replace(/_/g, ' ')}`,
        category: entry.category,
        tradeId: trade?.id,
        sortOrder,
      },
      update: {},
    })

    await prisma.budgetLine.create({
      data: {
        projectId: project.id,
        costCodeId: costCode.id,
        description: `${entry.section}, ${entry.category.toLowerCase().replace(/_/g, ' ')}`,
        category: entry.category,
        tradeId: trade?.id,
        originalBudget: Math.round(entry.amount * 100) / 100,
        sortOrder: sortOrder++,
      },
    })

    sovInputs.push({ description: `${entry.section}, ${entry.category.toLowerCase().replace(/_/g, ' ')}`, amount: entry.amount })
  }

  // Schedule of values, scaled from the budget to the contract so the SOV ties.
  const budgetTotal = sovInputs.reduce((a, s) => a + s.amount, 0)
  let allocated = 0
  for (const [i, line] of sovInputs.entries()) {
    const value =
      i === sovInputs.length - 1
        ? Math.round((contractSum - allocated) * 100) / 100
        : Math.round(contractSum * safeDiv(line.amount, budgetTotal) * 100) / 100
    allocated += value
    await prisma.sovLine.create({
      data: {
        projectId: project.id,
        number: String(i + 1).padStart(3, '0'),
        description: line.description,
        scheduledValue: value,
        sortOrder: i,
      },
    })
  }

  // Opening cash-flow curve across the contract dates.
  for (const period of defaultCurve(contractStart, contractCompletion)) {
    await prisma.cashFlowPeriod.create({
      data: { projectId: project.id, periodEnd: period.periodEnd, plannedDeltaPct: period.plannedDeltaPct },
    })
  }

  // Buyout packages carry over so the estimator's leveling work is not repeated.
  for (const pkg of bundle.estimate.bidPackages) {
    const created = await prisma.bidPackage.create({
      data: {
        projectId: project.id,
        tradeId: pkg.tradeId,
        name: pkg.name,
        divisionCode: pkg.divisionCode,
        budgetAmount: pkg.carriedAmount || pkg.budgetAmount,
        carriedAmount: pkg.carriedAmount,
        status: 'BIDDING',
        notes: pkg.notes,
        sortOrder: pkg.sortOrder,
      },
    })
    for (const quote of pkg.quotes) {
      await prisma.bidPackageQuote.create({
        data: {
          packageId: created.id,
          vendorId: quote.vendorId,
          vendorName: quote.vendorName,
          baseAmount: quote.baseAmount,
          adjustmentAmount: quote.adjustmentAmount,
          inclusions: quote.inclusions,
          exclusions: quote.exclusions,
          qualifications: quote.qualifications,
          allowances: quote.allowances,
          status: quote.status,
          notes: quote.notes,
          sortOrder: quote.sortOrder,
        },
      })
    }
  }

  // An opening forecast period, so the first month-end close has a baseline.
  const firstPeriodEnd = new Date(Date.UTC(contractStart.getUTCFullYear(), contractStart.getUTCMonth() + 1, 0))
  const period = await prisma.forecastPeriod.create({
    data: { projectId: project.id, periodEnd: firstPeriodEnd, status: 'OPEN' },
  })
  const budgetLines = await prisma.budgetLine.findMany({ where: { projectId: project.id } })
  for (const line of budgetLines) {
    await prisma.forecastLine.create({
      data: {
        periodId: period.id,
        costCodeId: line.costCodeId,
        currentBudget: line.originalBudget,
        costToDate: 0,
        pctComplete: 0,
        estimateToComplete: line.originalBudget,
        estimateAtCompletion: line.originalBudget,
        previousEac: line.originalBudget,
        confidence: 0.8,
      },
    })
  }

  // Lock the estimate: the basis of the bid must not change after award.
  await prisma.estimate.update({
    where: { id: estimateId },
    data: { status: 'AWARDED', lockedAt: new Date() },
  })
  if (bundle.estimate.bidId) {
    await prisma.bid.update({
      where: { id: bundle.estimate.bidId },
      data: { status: 'WON', decisionDate: new Date(), submittedAmount: contractSum },
    })
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Estimate',
    entityId: estimateId,
    action: 'CONVERT',
    summary: `Converted to project ${number} at a contract value of ${contractSum}. ${budgetLines.length} budget lines and ${sovInputs.length} schedule-of-values lines created.`,
  })

  revalidatePath('/estimating')
  revalidatePath('/projects')
  revalidatePath('/')
  redirect(`/projects/${project.id}`)
}

// ── Takeoff editing ───────────────────────────────────────────────────────

export async function saveTakeoffItem(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:estimates')

  const estimateId = String(formData.get('estimateId'))
  const itemId = String(formData.get('itemId') ?? '')
  const description = String(formData.get('description') ?? '').trim()

  if (!description) return { error: 'Enter a description for the line.' }

  const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, companyId: user.companyId } })
  if (!estimate) return { error: 'Estimate not found.' }
  if (estimate.lockedAt) return { error: 'This estimate is locked because it has been awarded. Create a new version to change it.' }

  const num = (key: string) => {
    const parsed = Number(formData.get(key))
    return isFinite(parsed) ? parsed : 0
  }

  const data = {
    estimateId,
    sectionId: String(formData.get('sectionId') ?? '') || null,
    divisionId: String(formData.get('divisionId') ?? '') || null,
    description,
    drawingRef: String(formData.get('drawingRef') ?? '') || null,
    measure: String(formData.get('measure') ?? 'EA') as MeasureType,
    count: num('count'),
    length: num('length'),
    width: num('width'),
    depth: num('depth'),
    uom: String(formData.get('uom') ?? '') || null,
    wastePct: num('wastePct'),
    laborClass: String(formData.get('laborClass') ?? '') || null,
    laborHrsPerUnit: num('laborHrsPerUnit'),
    materialUnitCost: num('materialUnitCost'),
    equipmentUnitCost: num('equipmentUnitCost'),
    subUnitCost: num('subUnitCost'),
    notes: String(formData.get('notes') ?? '') || null,
  }

  if (itemId) {
    await prisma.estimateItem.update({ where: { id: itemId }, data })
  } else {
    const count = await prisma.estimateItem.count({ where: { estimateId } })
    await prisma.estimateItem.create({ data: { ...data, sortOrder: count } })
  }

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'EstimateItem',
    entityId: itemId || estimateId,
    action: itemId ? 'UPDATE' : 'CREATE',
    summary: `${itemId ? 'Updated' : 'Added'} takeoff line "${description}"`,
  })

  revalidatePath(`/estimating/${estimateId}/takeoff`)
  revalidatePath(`/estimating/${estimateId}`)
  return {}
}

export async function deleteTakeoffItem(formData: FormData): Promise<void> {
  const user = await requireUser()
  assertCan(user.role, 'edit:estimates')

  const itemId = String(formData.get('itemId'))
  const item = await prisma.estimateItem.findFirst({
    where: { id: itemId, estimate: { companyId: user.companyId, lockedAt: null } },
  })
  if (!item) return

  await prisma.estimateItem.delete({ where: { id: itemId } })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'EstimateItem',
    entityId: itemId,
    action: 'DELETE',
    summary: `Removed takeoff line "${item.description}"`,
  })

  revalidatePath(`/estimating/${item.estimateId}/takeoff`)
  revalidatePath(`/estimating/${item.estimateId}`)
}

// ── General conditions ────────────────────────────────────────────────────

export async function saveGcItem(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:estimates')

  const estimateId = String(formData.get('estimateId'))
  const itemId = String(formData.get('itemId') ?? '')
  const item = String(formData.get('item') ?? '').trim()
  if (!item) return { error: 'Enter the general-conditions item.' }

  const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, companyId: user.companyId } })
  if (!estimate) return { error: 'Estimate not found.' }
  if (estimate.lockedAt) return { error: 'This estimate is locked.' }

  const data = {
    estimateId,
    item,
    basis: String(formData.get('basis') ?? 'LS'),
    qty: Number(formData.get('qty')) || 0,
    followsDuration: formData.get('followsDuration') === 'on',
    unitCost: Number(formData.get('unitCost')) || 0,
    notes: String(formData.get('notes') ?? '') || null,
  }

  if (itemId) await prisma.generalConditionItem.update({ where: { id: itemId }, data })
  else {
    const count = await prisma.generalConditionItem.count({ where: { estimateId } })
    await prisma.generalConditionItem.create({ data: { ...data, sortOrder: count } })
  }

  revalidatePath(`/estimating/${estimateId}/gc`)
  revalidatePath(`/estimating/${estimateId}`)
  return {}
}

// ── Setup and markups ─────────────────────────────────────────────────────

export async function updateEstimateSetup(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:estimates')

  const estimateId = String(formData.get('estimateId'))
  const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, companyId: user.companyId } })
  if (!estimate) return { error: 'Estimate not found.' }
  if (estimate.lockedAt) return { error: 'This estimate is locked because it has been awarded.' }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Enter an estimate name.' }

  const pct = (key: string, fallback: number) => {
    const parsed = Number(formData.get(key))
    return isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback
  }

  await prisma.estimate.update({
    where: { id: estimateId },
    data: {
      name,
      status: String(formData.get('status') ?? estimate.status) as never,
      clientName: String(formData.get('clientName') ?? '') || null,
      architect: String(formData.get('architect') ?? '') || null,
      address: String(formData.get('address') ?? '') || null,
      projectType: String(formData.get('projectType') ?? '') || null,
      bidDueDate: parseDate(formData.get('bidDueDate')),
      estimator: String(formData.get('estimator') ?? '') || null,
      drawingSet: String(formData.get('drawingSet') ?? '') || null,
      addenda: String(formData.get('addenda') ?? '') || null,
      durationWeeks: Number(formData.get('durationWeeks')) || 0,
      buildingAreaSf: Number(formData.get('buildingAreaSf')) || 0,
      laborBurdenPct: pct('laborBurdenPct', estimate.laborBurdenPct),
      salesTaxPct: pct('salesTaxPct', estimate.salesTaxPct),
      smallToolsPct: pct('smallToolsPct', estimate.smallToolsPct),
      contingencyPct: pct('contingencyPct', estimate.contingencyPct),
      overheadPct: pct('overheadPct', estimate.overheadPct),
      profitPct: pct('profitPct', estimate.profitPct),
      glInsurancePct: pct('glInsurancePct', estimate.glInsurancePct),
      bondPct: pct('bondPct', estimate.bondPct),
      exciseTaxPct: pct('exciseTaxPct', estimate.exciseTaxPct),
      roundToNearest: Number(formData.get('roundToNearest')) || 0,
    },
  })

  await recordAudit({
    companyId: user.companyId,
    userId: user.id,
    actor: user,
    entity: 'Estimate',
    entityId: estimateId,
    action: 'UPDATE',
    summary: `Estimate setup and markups updated`,
  })

  revalidatePath(`/estimating/${estimateId}`, 'layout')
  return {}
}

export async function saveLaborRate(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser()
  assertCan(user.role, 'edit:estimates')

  const estimateId = String(formData.get('estimateId'))
  const className = String(formData.get('className') ?? '').trim()
  const rate = Number(formData.get('rate'))

  if (!className) return { error: 'Enter a labor class name.' }
  if (!isFinite(rate) || rate < 0) return { error: 'Enter a valid hourly rate.' }

  const estimate = await prisma.estimate.findFirst({ where: { id: estimateId, companyId: user.companyId } })
  if (!estimate) return { error: 'Estimate not found.' }
  if (estimate.lockedAt) return { error: 'This estimate is locked.' }

  const count = await prisma.laborRate.count({ where: { estimateId } })
  await prisma.laborRate.upsert({
    where: { estimateId_className: { estimateId, className } },
    create: { estimateId, className, rate, sortOrder: count },
    update: { rate },
  })

  revalidatePath(`/estimating/${estimateId}/setup`)
  revalidatePath(`/estimating/${estimateId}`)
  return {}
}
