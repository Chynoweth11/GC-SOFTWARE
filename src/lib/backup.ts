import 'server-only'
import { prisma } from '@/lib/db'

/**
 * Project backup and restore.
 *
 * The backup carries stored values only: budgets, commitments, costs, change
 * orders, billings, forecasts and quantities. No derived figure is written into
 * the file, because a restored project must recompute its entire position from
 * the same engine as a live one. A backup that carried a computed margin would
 * become a second source of truth the moment a formula changed.
 *
 * References to shared records (line items, trades, vendors, clients, users)
 * travel as their business keys: a line item's code, a vendor's name, never
 * as database ids, so a project can be restored into a company whose ids differ.
 */

export const BACKUP_FORMAT = 'constructx.project.backup'
export const BACKUP_VERSION = 1

export interface ProjectBackup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  company: { name: string }
  project: Record<string, unknown>
  costCodes: Record<string, unknown>[]
  budgetLines: Record<string, unknown>[]
  budgetRevisions: Record<string, unknown>[]
  commitments: Record<string, unknown>[]
  subInvoices: Record<string, unknown>[]
  costTransactions: Record<string, unknown>[]
  changeOrders: Record<string, unknown>[]
  sovLines: Record<string, unknown>[]
  ownerBillings: Record<string, unknown>[]
  forecastPeriods: Record<string, unknown>[]
  cashFlowPeriods: Record<string, unknown>[]
  quantityItems: Record<string, unknown>[]
  snapshots: Record<string, unknown>[]
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

// ── Export ────────────────────────────────────────────────────────────────

export async function exportProject(projectId: string, companyId: string): Promise<ProjectBackup | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: { client: true, pm: true, company: true },
  })
  if (!project) return null

  const [budgetLines, revisions, commitments, subInvoices, costs, changeOrders, sovLines, billings, forecasts, cashFlow, quantities, snapshots] =
    await Promise.all([
      prisma.budgetLine.findMany({
        where: { projectId },
        include: { costCode: { include: { trade: true } }, trade: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.budgetRevision.findMany({
        where: { projectId },
        include: { budgetLine: { include: { costCode: true } }, changeOrder: { select: { number: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.commitment.findMany({
        where: { projectId },
        include: { vendor: true, lines: { include: { costCode: true } }, changes: { include: { changeOrder: { select: { number: true } } } } },
        orderBy: { number: 'asc' },
      }),
      prisma.subInvoice.findMany({
        where: { projectId },
        include: { vendor: true, costCode: true, commitment: { select: { number: true } } },
        orderBy: { invoiceNumber: 'asc' },
      }),
      prisma.costTransaction.findMany({
        where: { projectId },
        include: { costCode: true, vendor: true, commitment: { select: { number: true } }, subInvoice: { select: { invoiceNumber: true } } },
        orderBy: { date: 'asc' },
      }),
      prisma.changeOrder.findMany({
        where: { projectId },
        include: {
          trade: true,
          signatures: { orderBy: { sortOrder: 'asc' } },
          attachments: { orderBy: { createdAt: 'asc' } },
          lines: { include: { costCode: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        },
        orderBy: { number: 'asc' },
      }),
      prisma.sovLine.findMany({ where: { projectId }, include: { costCode: true }, orderBy: { sortOrder: 'asc' } }),
      prisma.ownerBilling.findMany({
        where: { projectId },
        include: { lines: { include: { sovLine: { select: { number: true } } } } },
        orderBy: { appNumber: 'asc' },
      }),
      prisma.forecastPeriod.findMany({
        where: { projectId },
        include: { lines: { include: { costCode: true } } },
        orderBy: { periodEnd: 'asc' },
      }),
      prisma.cashFlowPeriod.findMany({ where: { projectId }, orderBy: { periodEnd: 'asc' } }),
      prisma.quantityItem.findMany({
        where: { projectId },
        include: { costCode: true, entries: true },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.projectSnapshot.findMany({ where: { projectId }, orderBy: { asOf: 'asc' } }),
    ])

  // Every line item the project touches, so a restore into a fresh company can
  // recreate them with their category and trade rather than guessing.
  const codeMap = new Map<string, { code: string; description: string; category: string; tradeName: string | null }>()
  const noteCode = (costCode: { code: string; description: string; category: string } | null, tradeName: string | null) => {
    if (!costCode || codeMap.has(costCode.code)) return
    codeMap.set(costCode.code, {
      code: costCode.code,
      description: costCode.description,
      category: costCode.category,
      tradeName,
    })
  }
  for (const line of budgetLines) noteCode(line.costCode, line.costCode.trade?.name ?? null)
  for (const commitment of commitments) for (const line of commitment.lines) noteCode(line.costCode, null)
  for (const transaction of costs) noteCode(transaction.costCode, null)
  for (const co of changeOrders) for (const line of co.lines) noteCode(line.costCode, null)
  for (const sov of sovLines) noteCode(sov.costCode, null)
  for (const period of forecasts) for (const line of period.lines) noteCode(line.costCode, null)
  for (const item of quantities) noteCode(item.costCode, null)
  for (const invoice of subInvoices) noteCode(invoice.costCode, null)

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    company: { name: project.company.name },
    project: {
      number: project.number,
      name: project.name,
      status: project.status,
      projectType: project.projectType,
      deliveryMethod: project.deliveryMethod,
      architect: project.architect,
      superintendent: project.superintendent,
      address: project.address,
      city: project.city,
      state: project.state,
      clientName: project.client?.name ?? null,
      clientType: project.client?.type ?? null,
      pmEmail: project.pm?.email ?? null,
      originalContractSum: project.originalContractSum,
      ownerRetentionPct: project.ownerRetentionPct,
      defaultSubRetentionPct: project.defaultSubRetentionPct,
      targetMarginPct: project.targetMarginPct,
      laborBurdenPct: project.laborBurdenPct,
      overheadPct: project.overheadPct,
      workDaysPerWeek: project.workDaysPerWeek,
      noticeToProceed: iso(project.noticeToProceed),
      contractStart: iso(project.contractStart),
      contractCompletion: iso(project.contractCompletion),
      forecastCompletion: iso(project.forecastCompletion),
      dataDate: iso(project.dataDate),
      eacMethod: project.eacMethod,
      pocMethod: project.pocMethod,
      manualPctComplete: project.manualPctComplete,
      pendingCoInclusionPct: project.pendingCoInclusionPct,
      safetyScore: project.safetyScore,
      qualityScore: project.qualityScore,
      clientSatScore: project.clientSatScore,
      recordablesYtd: project.recordablesYtd,
      nearMissesYtd: project.nearMissesYtd,
      observationsYtd: project.observationsYtd,
      notes: project.notes,
    },
    costCodes: [...codeMap.values()],
    budgetLines: budgetLines.map((l) => ({
      costCode: l.costCode.code,
      description: l.description,
      category: l.category,
      tradeName: l.trade?.name ?? null,
      originalBudget: l.originalBudget,
      notes: l.notes,
      sortOrder: l.sortOrder,
    })),
    budgetRevisions: revisions.map((r) => ({
      costCode: r.budgetLine.costCode.code,
      type: r.type,
      amount: r.amount,
      reason: r.reason,
      changeOrderNumber: r.changeOrder?.number ?? null,
      transferGroup: r.transferGroup,
      createdBy: r.createdBy,
      createdAt: iso(r.createdAt),
    })),
    commitments: commitments.map((c) => ({
      number: c.number,
      type: c.type,
      vendorName: c.vendor.name,
      description: c.description,
      scopeOfWork: c.scopeOfWork,
      status: c.status,
      originalAmount: c.originalAmount,
      retentionPct: c.retentionPct,
      pctComplete: c.pctComplete,
      receivedAmount: c.receivedAmount,
      forecastFinalOverride: c.forecastFinalOverride,
      dateIssued: iso(c.dateIssued),
      dateExecuted: iso(c.dateExecuted),
      expectedDelivery: iso(c.expectedDelivery),
      actualDelivery: iso(c.actualDelivery),
      notes: c.notes,
      lines: c.lines.map((line) => ({
        costCode: line.costCode.code,
        description: line.description,
        amount: line.amount,
      })),
      changes: c.changes.map((change) => ({
        number: change.number,
        description: change.description,
        amount: change.amount,
        status: change.status,
        changeOrderNumber: change.changeOrder?.number ?? null,
        dateSubmitted: iso(change.dateSubmitted),
        dateApproved: iso(change.dateApproved),
      })),
    })),
    subInvoices: subInvoices.map((i) => ({
      invoiceNumber: i.invoiceNumber,
      commitmentNumber: i.commitment?.number ?? null,
      vendorName: i.vendor.name,
      costCode: i.costCode?.code ?? null,
      periodEnd: iso(i.periodEnd),
      amount: i.amount,
      retentionPct: i.retentionPct,
      amountPaid: i.amountPaid,
      approved: i.approved,
      lienWaiverReceived: i.lienWaiverReceived,
      dateReceived: iso(i.dateReceived),
      dateApproved: iso(i.dateApproved),
      datePaid: iso(i.datePaid),
      notes: i.notes,
    })),
    costTransactions: costs.map((t) => ({
      costCode: t.costCode.code,
      commitmentNumber: t.commitment?.number ?? null,
      subInvoiceNumber: t.subInvoice?.invoiceNumber ?? null,
      vendorName: t.vendor?.name ?? null,
      date: iso(t.date),
      type: t.type,
      source: t.source,
      description: t.description,
      reference: t.reference,
      amount: t.amount,
      hours: t.hours,
      needsCoding: t.needsCoding,
      notes: t.notes,
      deletedAt: iso(t.deletedAt),
    })),
    changeOrders: changeOrders.map((co) => ({
      number: co.number,
      description: co.description,
      origin: co.origin,
      type: co.type,
      status: co.status,
      documentKind: co.documentKind,
      tradeName: co.trade?.name ?? null,
      counterparty: co.counterparty,
      reference: co.reference,
      priceFromLines: co.priceFromLines,
      enteredOwnerAmount: co.enteredOwnerAmount,
      enteredCostAmount: co.enteredCostAmount,
      laborBurdenPct: co.laborBurdenPct,
      salesTaxPct: co.salesTaxPct,
      smallToolsPct: co.smallToolsPct,
      contingencyPct: co.contingencyPct,
      overheadPct: co.overheadPct,
      profitPct: co.profitPct,
      glInsurancePct: co.glInsurancePct,
      bondPct: co.bondPct,
      exciseTaxPct: co.exciseTaxPct,
      roundToNearest: co.roundToNearest,
      probabilityPct: co.probabilityPct,
      scheduleImpactDays: co.scheduleImpactDays,
      postsToBudget: co.postsToBudget,
      dateInitiated: iso(co.dateInitiated),
      dateSubmitted: iso(co.dateSubmitted),
      dateApproved: iso(co.dateApproved),
      anticipatedApproval: iso(co.anticipatedApproval),
      sentForSignatureAt: iso(co.sentForSignatureAt),
      fullySignedAt: iso(co.fullySignedAt),
      // The approval travels with the document, because a backup that restored
      // an approved change order as unapproved would silently drop it out of
      // the contract value.
      approvedAt: iso(co.approvedAt),
      approvalCertification: co.approvalCertification,
      unapprovedReason: co.unapprovedReason,
      notes: co.notes,
      signatures: co.signatures.map((signature) => ({
        party: signature.party,
        role: signature.role,
        email: signature.email,
        status: signature.status,
        signedAt: iso(signature.signedAt),
        note: signature.note,
        sortOrder: signature.sortOrder,
      })),
      attachments: co.attachments.map((attachment) => ({
        kind: attachment.kind,
        fileName: attachment.fileName,
        location: attachment.location,
        note: attachment.note,
      })),
      lines: co.lines.map((line) => ({
        costCode: line.costCode.code,
        category: line.category,
        description: line.description,
        scope: line.scope,
        divisionCode: line.divisionCode,
        measure: line.measure,
        count: line.count,
        length: line.length,
        width: line.width,
        depth: line.depth,
        netQtyOverride: line.netQtyOverride,
        uom: line.uom,
        wastePct: line.wastePct,
        laborClass: line.laborClass,
        laborHrsPerUnit: line.laborHrsPerUnit,
        laborRateOverride: line.laborRateOverride,
        materialUnitCost: line.materialUnitCost,
        equipmentUnitCost: line.equipmentUnitCost,
        subUnitCost: line.subUnitCost,
        otherUnitCost: line.otherUnitCost,
        notes: line.notes,
        sortOrder: line.sortOrder,
      })),
    })),
    sovLines: sovLines.map((s) => ({
      number: s.number,
      description: s.description,
      scheduledValue: s.scheduledValue,
      costCode: s.costCode?.code ?? null,
      changeOrderNumber: s.changeOrderNumber,
      sortOrder: s.sortOrder,
    })),
    ownerBillings: billings.map((b) => ({
      appNumber: b.appNumber,
      periodTo: iso(b.periodTo),
      dateSubmitted: iso(b.dateSubmitted),
      dateApproved: iso(b.dateApproved),
      datePaid: iso(b.datePaid),
      retainagePct: b.retainagePct,
      amountPaid: b.amountPaid,
      status: b.status,
      notes: b.notes,
      lines: b.lines.map((line) => ({
        sovNumber: line.sovLine.number,
        workThisPeriod: line.workThisPeriod,
        storedMaterials: line.storedMaterials,
      })),
    })),
    forecastPeriods: forecasts.map((p) => ({
      periodEnd: iso(p.periodEnd),
      status: p.status,
      lockedAt: iso(p.lockedAt),
      lockedBy: p.lockedBy,
      notes: p.notes,
      lines: p.lines.map((line) => ({
        costCode: line.costCode.code,
        currentBudget: line.currentBudget,
        costToDate: line.costToDate,
        committed: line.committed,
        accrued: line.accrued,
        remainingCommitment: line.remainingCommitment,
        pctComplete: line.pctComplete,
        etcOverride: line.etcOverride,
        estimateToComplete: line.estimateToComplete,
        estimateAtCompletion: line.estimateAtCompletion,
        previousEac: line.previousEac,
        riskLevel: line.riskLevel,
        confidence: line.confidence,
        note: line.note,
      })),
    })),
    cashFlowPeriods: cashFlow.map((p) => ({
      periodEnd: iso(p.periodEnd),
      plannedDeltaPct: p.plannedDeltaPct,
      actualPctComplete: p.actualPctComplete,
      actualCost: p.actualCost,
      billingOverride: p.billingOverride,
      collectionOverride: p.collectionOverride,
      notes: p.notes,
    })),
    quantityItems: quantities.map((q) => ({
      description: q.description,
      costCode: q.costCode?.code ?? null,
      uom: q.uom,
      budgetQty: q.budgetQty,
      budgetUnitRate: q.budgetUnitRate,
      materialOrderedQty: q.materialOrderedQty,
      targetFinish: iso(q.targetFinish),
      notes: q.notes,
      sortOrder: q.sortOrder,
      entries: q.entries.map((entry) => ({
        periodEnd: iso(entry.periodEnd),
        installedQty: entry.installedQty,
        actualHours: entry.actualHours,
        crewDays: entry.crewDays,
        notes: entry.notes,
      })),
    })),
    snapshots: snapshots.map((s) => ({
      asOf: iso(s.asOf),
      label: s.label,
      payload: s.payload,
      createdBy: s.createdBy,
    })),
  }
}

// ── Import ────────────────────────────────────────────────────────────────

export interface RestoreResult {
  projectId?: string
  number?: string
  created: Record<string, number>
  warnings: string[]
  error?: string
}

function asDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return isNaN(parsed.getTime()) ? null : parsed
}

function asNum(value: unknown): number {
  return typeof value === 'number' && isFinite(value) ? value : 0
}

function asNullableNum(value: unknown): number | null {
  return typeof value === 'number' && isFinite(value) ? value : null
}

function asStr(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

/** Falls back to a known-good default when a backup carries an unknown enum value. */
function asEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = asStr(value)
  return (allowed as readonly string[]).includes(candidate) ? (candidate as T) : fallback
}

const COST_CATEGORIES = ['LABOR', 'MATERIAL', 'EQUIPMENT', 'SUBCONTRACT', 'GENERAL_CONDITIONS', 'OVERHEAD', 'CONTINGENCY', 'OTHER'] as const
const PROJECT_STATUSES = ['BIDDING', 'AWARDED', 'PRECONSTRUCTION', 'UNDER_CONSTRUCTION', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CLOSED'] as const
const EAC_METHODS = ['BOTTOM_UP', 'CPI_BASED', 'BUDGET_RATE'] as const
const POC_METHODS = ['COST_TO_COST', 'QUANTITY', 'SUBCONTRACTOR_PROGRESS', 'SCHEDULE', 'MANUAL', 'EARNED_VALUE', 'BILLING'] as const
const REVISION_TYPES = ['CHANGE_ORDER', 'TRANSFER', 'REVISION', 'CONTINGENCY_DRAW'] as const
const COMMITMENT_TYPES = ['SUBCONTRACT', 'PURCHASE_ORDER', 'MATERIAL', 'EQUIPMENT', 'SERVICE'] as const
const COMMITMENT_STATUSES = ['DRAFT', 'ISSUED', 'EXECUTED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'INVOICED', 'CLOSED', 'CANCELLED'] as const
const COMMITMENT_CHANGE_STATUSES = ['PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'VOID'] as const
const COST_TX_TYPES = ['ACTUAL', 'ACCRUAL', 'COMMITTED_ADJUSTMENT'] as const
const COST_TX_SOURCES = ['MANUAL', 'IMPORT', 'SUB_INVOICE', 'PAYROLL', 'PURCHASE_ORDER', 'JOURNAL'] as const
const CO_TYPES = ['OWNER_REQUEST', 'DESIGN_CHANGE', 'FIELD_CONDITION', 'ALLOWANCE_RECONCILE', 'ASI_DRIVEN', 'BACKCHARGE', 'TIME_ONLY', 'INTERNAL_BUDGET'] as const
const CO_STATUSES = ['DRAFT', 'INTERNAL_REVIEW', 'READY_TO_SEND', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED', 'FULLY_SIGNED', 'APPROVED', 'REJECTED', 'CANCELLED', 'VOIDED', 'SUPERSEDED'] as const
const DOCUMENT_KINDS = ['CHANGE_ORDER', 'CONTRACT', 'CONTRACT_AMENDMENT', 'ADDENDUM', 'OWNER_CHANGE', 'SUBCONTRACT_CHANGE', 'OTHER'] as const
const SIGNATURE_STATUSES = ['AWAITING', 'SIGNED', 'DECLINED'] as const
const ATTACHMENT_KINDS = ['SIGNED_DOCUMENT', 'UNSIGNED_DOCUMENT', 'PRICING_BACKUP', 'SUBCONTRACTOR_QUOTE', 'CORRESPONDENCE', 'OTHER'] as const
const MEASURE_TYPES = ['EA', 'LF', 'SF', 'SY', 'CY', 'CF', 'TON', 'LB', 'HR', 'DAY', 'LS', 'ALLOWANCE'] as const
const BILLING_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'] as const
const FORECAST_STATUSES = ['OPEN', 'LOCKED'] as const
const RISK_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const
const CLIENT_TYPES = ['RESIDENTIAL', 'COMMERCIAL', 'PUBLIC', 'DEVELOPER', 'INSTITUTIONAL', 'OTHER'] as const

/**
 * Restores a backup as a **new** project.
 *
 * Deliberately never overwrites an existing one: a restore that could silently
 * replace live budgets and billings is a way to lose a month of work. If the
 * job number is taken, the restore takes the next free suffix and says so.
 */
export async function restoreProject(backup: unknown, user: { id: string; companyId: string }): Promise<RestoreResult> {
  const created: Record<string, number> = {}
  const warnings: string[] = []
  const bump = (key: string, by = 1) => {
    created[key] = (created[key] ?? 0) + by
  }

  if (!backup || typeof backup !== 'object') return { created, warnings, error: 'That file is not a backup.' }
  const doc = backup as Partial<ProjectBackup>
  if (doc.format !== BACKUP_FORMAT) return { created, warnings, error: 'That file is not a ConstructX project backup.' }
  if (typeof doc.version !== 'number' || doc.version > BACKUP_VERSION) {
    return { created, warnings, error: `This backup was written by a newer version of ConstructX (${String(doc.version)}).` }
  }
  const source = doc.project
  if (!source || typeof source !== 'object') return { created, warnings, error: 'The backup contains no project.' }

  const companyId = user.companyId

  // ── Shared records, resolved by business key ───────────────────────────
  const tradeIdByName = new Map<string, string>()
  async function tradeId(name: unknown): Promise<string | null> {
    const key = asStr(name).trim()
    if (!key) return null
    const cached = tradeIdByName.get(key)
    if (cached) return cached
    const existing = await prisma.trade.findFirst({ where: { companyId, name: key } })
    const trade = existing ?? (await prisma.trade.create({ data: { companyId, name: key } }))
    if (!existing) bump('trades')
    tradeIdByName.set(key, trade.id)
    return trade.id
  }

  const costCodeIdByCode = new Map<string, string>()
  const codeDefinitions = new Map<string, Record<string, unknown>>()
  for (const definition of rows(doc.costCodes)) {
    const code = asStr(definition.code).trim()
    if (code) codeDefinitions.set(code, definition)
  }

  async function costCodeId(code: unknown): Promise<string | null> {
    const key = asStr(code).trim()
    if (!key) return null
    const cached = costCodeIdByCode.get(key)
    if (cached) return cached

    const existing = await prisma.costCode.findFirst({ where: { companyId, code: key } })
    if (existing) {
      costCodeIdByCode.set(key, existing.id)
      return existing.id
    }

    const definition = codeDefinitions.get(key)
    if (!definition) {
      warnings.push(`Line item ${key} was referenced but not defined in the backup; it was created without a category.`)
    }
    const record = await prisma.costCode.create({
      data: {
        companyId,
        code: key,
        description: asStr(definition?.description) || key,
        category: asEnum(definition?.category, COST_CATEGORIES, 'OTHER'),
        tradeId: await tradeId(definition?.tradeName),
      },
    })
    bump('costCodes')
    costCodeIdByCode.set(key, record.id)
    return record.id
  }

  const vendorIdByName = new Map<string, string>()
  async function vendorId(name: unknown): Promise<string | null> {
    const key = asStr(name).trim()
    if (!key) return null
    const cached = vendorIdByName.get(key)
    if (cached) return cached
    const existing = await prisma.vendor.findFirst({ where: { companyId, name: key } })
    const vendor = existing ?? (await prisma.vendor.create({ data: { companyId, name: key } }))
    if (!existing) bump('vendors')
    vendorIdByName.set(key, vendor.id)
    return vendor.id
  }

  let clientId: string | null = null
  const clientName = asStr(source.clientName).trim()
  if (clientName) {
    const existing = await prisma.client.findFirst({ where: { companyId, name: clientName } })
    const client =
      existing ??
      (await prisma.client.create({
        data: { companyId, name: clientName, type: asEnum(source.clientType, CLIENT_TYPES, 'COMMERCIAL') },
      }))
    if (!existing) bump('clients')
    clientId = client.id
  }

  let pmUserId: string | null = null
  const pmEmail = asStr(source.pmEmail).trim()
  if (pmEmail) {
    const pm = await prisma.user.findFirst({ where: { companyId, email: pmEmail } })
    if (pm) pmUserId = pm.id
    else warnings.push(`Project manager ${pmEmail} is not a user in this company; the project was restored unassigned.`)
  }

  // ── The project, never overwriting an existing job number ──────────────
  let number = asStr(source.number).trim() || 'RESTORED'
  if (await prisma.project.findFirst({ where: { companyId, number } })) {
    const base = number
    let suffix = 1
    while (await prisma.project.findFirst({ where: { companyId, number: `${base}-R${suffix}` } })) suffix += 1
    number = `${base}-R${suffix}`
    warnings.push(`Job number ${base} already exists, so the restore was created as ${number}.`)
  }

  const project = await prisma.project.create({
    data: {
      companyId,
      number,
      name: asStr(source.name) || number,
      status: asEnum(source.status, PROJECT_STATUSES, 'ACTIVE'),
      projectType: asStr(source.projectType) || null,
      deliveryMethod: asStr(source.deliveryMethod) || null,
      architect: asStr(source.architect) || null,
      superintendent: asStr(source.superintendent) || null,
      address: asStr(source.address) || null,
      city: asStr(source.city) || null,
      state: asStr(source.state) || null,
      clientId,
      pmUserId,
      originalContractSum: asNum(source.originalContractSum),
      ownerRetentionPct: asNum(source.ownerRetentionPct),
      defaultSubRetentionPct: asNum(source.defaultSubRetentionPct),
      targetMarginPct: asNum(source.targetMarginPct),
      laborBurdenPct: asNum(source.laborBurdenPct),
      overheadPct: asNum(source.overheadPct),
      workDaysPerWeek: asNum(source.workDaysPerWeek) || 5,
      noticeToProceed: asDate(source.noticeToProceed),
      contractStart: asDate(source.contractStart),
      contractCompletion: asDate(source.contractCompletion),
      forecastCompletion: asDate(source.forecastCompletion),
      dataDate: asDate(source.dataDate) ?? new Date(),
      eacMethod: asEnum(source.eacMethod, EAC_METHODS, 'BOTTOM_UP'),
      pocMethod: asEnum(source.pocMethod, POC_METHODS, 'COST_TO_COST'),
      manualPctComplete: asNullableNum(source.manualPctComplete),
      pendingCoInclusionPct: asNum(source.pendingCoInclusionPct),
      safetyScore: asNullableNum(source.safetyScore),
      qualityScore: asNullableNum(source.qualityScore),
      clientSatScore: asNullableNum(source.clientSatScore),
      recordablesYtd: asNum(source.recordablesYtd),
      nearMissesYtd: asNum(source.nearMissesYtd),
      observationsYtd: asNum(source.observationsYtd),
      notes: asStr(source.notes) || null,
    },
  })
  const projectId = project.id
  bump('projects')

  // ── Budget ─────────────────────────────────────────────────────────────
  const budgetLineIdByCode = new Map<string, string>()
  for (const line of rows(doc.budgetLines)) {
    const id = await costCodeId(line.costCode)
    if (!id) continue
    const record = await prisma.budgetLine.create({
      data: {
        projectId,
        costCodeId: id,
        description: asStr(line.description) || asStr(line.costCode),
        category: asEnum(line.category, COST_CATEGORIES, 'OTHER'),
        tradeId: await tradeId(line.tradeName),
        originalBudget: asNum(line.originalBudget),
        notes: asStr(line.notes) || null,
        sortOrder: asNum(line.sortOrder),
      },
    })
    budgetLineIdByCode.set(asStr(line.costCode), record.id)
    bump('budgetLines')
  }

  // ── Change orders come before revisions, which may reference them ──────
  const changeOrderIdByNumber = new Map<string, string>()
  for (const co of rows(doc.changeOrders)) {
    const record = await prisma.changeOrder.create({
      data: {
        projectId,
        number: asStr(co.number),
        description: asStr(co.description),
        origin: asStr(co.origin) || null,
        type: asEnum(co.type, CO_TYPES, 'OWNER_REQUEST'),
        status: asEnum(co.status, CO_STATUSES, 'DRAFT'),
        documentKind: asEnum(co.documentKind, DOCUMENT_KINDS, 'CHANGE_ORDER'),
        tradeId: await tradeId(co.tradeName),
        counterparty: asStr(co.counterparty) || null,
        reference: asStr(co.reference) || null,
        priceFromLines: co.priceFromLines !== false,
        enteredOwnerAmount: asNum(co.enteredOwnerAmount),
        enteredCostAmount: asNum(co.enteredCostAmount),
        laborBurdenPct: asNum(co.laborBurdenPct),
        salesTaxPct: asNum(co.salesTaxPct),
        smallToolsPct: asNum(co.smallToolsPct),
        contingencyPct: asNum(co.contingencyPct),
        overheadPct: asNum(co.overheadPct),
        profitPct: asNum(co.profitPct),
        glInsurancePct: asNum(co.glInsurancePct),
        bondPct: asNum(co.bondPct),
        exciseTaxPct: asNum(co.exciseTaxPct),
        roundToNearest: asNum(co.roundToNearest),
        probabilityPct: asNum(co.probabilityPct),
        scheduleImpactDays: asNum(co.scheduleImpactDays),
        postsToBudget: co.postsToBudget !== false,
        dateInitiated: asDate(co.dateInitiated),
        dateSubmitted: asDate(co.dateSubmitted),
        dateApproved: asDate(co.dateApproved),
        anticipatedApproval: asDate(co.anticipatedApproval),
        sentForSignatureAt: asDate(co.sentForSignatureAt),
        fullySignedAt: asDate(co.fullySignedAt),
        approvedAt: asDate(co.approvedAt),
        approvalCertification: asStr(co.approvalCertification) || null,
        unapprovedReason: asStr(co.unapprovedReason) || null,
        notes: asStr(co.notes) || null,
      },
    })

    for (const signature of rows(co.signatures)) {
      await prisma.documentSignature.create({
        data: {
          changeOrderId: record.id,
          party: asStr(signature.party) || 'Party',
          role: asStr(signature.role) || null,
          email: asStr(signature.email) || null,
          status: asEnum(signature.status, SIGNATURE_STATUSES, 'AWAITING'),
          signedAt: asDate(signature.signedAt),
          note: asStr(signature.note) || null,
          sortOrder: asNum(signature.sortOrder),
        },
      })
    }

    for (const attachment of rows(co.attachments)) {
      await prisma.documentAttachment.create({
        data: {
          changeOrderId: record.id,
          kind: asEnum(attachment.kind, ATTACHMENT_KINDS, 'OTHER'),
          fileName: asStr(attachment.fileName) || 'Attachment',
          location: asStr(attachment.location) || null,
          note: asStr(attachment.note) || null,
        },
      })
    }
    changeOrderIdByNumber.set(asStr(co.number), record.id)
    bump('changeOrders')

    for (const line of rows(co.lines)) {
      const id = await costCodeId(line.costCode)
      if (!id) continue
      await prisma.changeOrderLine.create({
        data: {
          changeOrderId: record.id,
          costCodeId: id,
          category: asEnum(line.category, COST_CATEGORIES, 'OTHER'),
          description: asStr(line.description) || null,
          scope: asStr(line.scope) || null,
          divisionCode: asStr(line.divisionCode) || null,
          measure: asEnum(line.measure, MEASURE_TYPES, 'LS'),
          count: asNum(line.count),
          length: asNum(line.length),
          width: asNum(line.width),
          depth: asNum(line.depth),
          netQtyOverride: line.netQtyOverride == null ? null : asNum(line.netQtyOverride),
          uom: asStr(line.uom) || null,
          wastePct: asNum(line.wastePct),
          laborClass: asStr(line.laborClass) || null,
          laborHrsPerUnit: asNum(line.laborHrsPerUnit),
          laborRateOverride: line.laborRateOverride == null ? null : asNum(line.laborRateOverride),
          materialUnitCost: asNum(line.materialUnitCost),
          equipmentUnitCost: asNum(line.equipmentUnitCost),
          subUnitCost: asNum(line.subUnitCost),
          otherUnitCost: asNum(line.otherUnitCost),
          notes: asStr(line.notes) || null,
          sortOrder: asNum(line.sortOrder),
        },
      })
    }
  }

  for (const revision of rows(doc.budgetRevisions)) {
    const budgetLineId = budgetLineIdByCode.get(asStr(revision.costCode))
    if (!budgetLineId) {
      warnings.push(`A budget revision referenced line item ${asStr(revision.costCode)}, which has no budget line; it was skipped.`)
      continue
    }
    await prisma.budgetRevision.create({
      data: {
        projectId,
        budgetLineId,
        type: asEnum(revision.type, REVISION_TYPES, 'REVISION'),
        amount: asNum(revision.amount),
        reason: asStr(revision.reason) || 'Restored from backup',
        changeOrderId: changeOrderIdByNumber.get(asStr(revision.changeOrderNumber)) ?? null,
        transferGroup: asStr(revision.transferGroup) || null,
        createdBy: asStr(revision.createdBy) || null,
        // A revision has no separate date field: its creation time is when the
        // budget moved, so it has to survive the restore rather than reset to now.
        ...(asDate(revision.createdAt) ? { createdAt: asDate(revision.createdAt)! } : {}),
      },
    })
    bump('budgetRevisions')
  }

  // ── Commitments ────────────────────────────────────────────────────────
  const commitmentIdByNumber = new Map<string, string>()
  for (const commitment of rows(doc.commitments)) {
    const vendor = await vendorId(commitment.vendorName)
    if (!vendor) {
      warnings.push(`Commitment ${asStr(commitment.number)} had no vendor and was skipped.`)
      continue
    }
    const record = await prisma.commitment.create({
      data: {
        projectId,
        vendorId: vendor,
        number: asStr(commitment.number),
        type: asEnum(commitment.type, COMMITMENT_TYPES, 'SUBCONTRACT'),
        description: asStr(commitment.description) || null,
        scopeOfWork: asStr(commitment.scopeOfWork) || null,
        status: asEnum(commitment.status, COMMITMENT_STATUSES, 'ISSUED'),
        originalAmount: asNum(commitment.originalAmount),
        retentionPct: asNum(commitment.retentionPct),
        pctComplete: asNum(commitment.pctComplete),
        receivedAmount: asNum(commitment.receivedAmount),
        forecastFinalOverride: asNullableNum(commitment.forecastFinalOverride),
        dateIssued: asDate(commitment.dateIssued),
        dateExecuted: asDate(commitment.dateExecuted),
        expectedDelivery: asDate(commitment.expectedDelivery),
        actualDelivery: asDate(commitment.actualDelivery),
        notes: asStr(commitment.notes) || null,
      },
    })
    commitmentIdByNumber.set(asStr(commitment.number), record.id)
    bump('commitments')

    for (const line of rows(commitment.lines)) {
      const id = await costCodeId(line.costCode)
      if (!id) continue
      await prisma.commitmentLine.create({
        data: {
          commitmentId: record.id,
          costCodeId: id,
          description: asStr(line.description) || null,
          amount: asNum(line.amount),
        },
      })
    }
    for (const change of rows(commitment.changes)) {
      await prisma.commitmentChange.create({
        data: {
          commitmentId: record.id,
          number: asStr(change.number),
          description: asStr(change.description),
          amount: asNum(change.amount),
          status: asEnum(change.status, COMMITMENT_CHANGE_STATUSES, 'PENDING'),
          changeOrderId: changeOrderIdByNumber.get(asStr(change.changeOrderNumber)) ?? null,
          dateSubmitted: asDate(change.dateSubmitted),
          dateApproved: asDate(change.dateApproved),
        },
      })
    }
  }

  // ── Subcontractor invoices ─────────────────────────────────────────────
  const subInvoiceIdByNumber = new Map<string, string>()
  for (const invoice of rows(doc.subInvoices)) {
    const vendor = await vendorId(invoice.vendorName)
    if (!vendor) {
      warnings.push(`Invoice ${asStr(invoice.invoiceNumber)} had no vendor and was skipped.`)
      continue
    }
    const record = await prisma.subInvoice.create({
      data: {
        projectId,
        commitmentId: commitmentIdByNumber.get(asStr(invoice.commitmentNumber)) ?? null,
        vendorId: vendor,
        costCodeId: await costCodeId(invoice.costCode),
        invoiceNumber: asStr(invoice.invoiceNumber),
        periodEnd: asDate(invoice.periodEnd),
        amount: asNum(invoice.amount),
        retentionPct: asNum(invoice.retentionPct),
        amountPaid: asNum(invoice.amountPaid),
        approved: invoice.approved === true,
        lienWaiverReceived: invoice.lienWaiverReceived === true,
        dateReceived: asDate(invoice.dateReceived),
        dateApproved: asDate(invoice.dateApproved),
        datePaid: asDate(invoice.datePaid),
        notes: asStr(invoice.notes) || null,
      },
    })
    subInvoiceIdByNumber.set(asStr(invoice.invoiceNumber), record.id)
    bump('subInvoices')
  }

  // ── Costs ──────────────────────────────────────────────────────────────
  for (const transaction of rows(doc.costTransactions)) {
    const id = await costCodeId(transaction.costCode)
    if (!id) continue
    await prisma.costTransaction.create({
      data: {
        projectId,
        costCodeId: id,
        commitmentId: commitmentIdByNumber.get(asStr(transaction.commitmentNumber)) ?? null,
        subInvoiceId: subInvoiceIdByNumber.get(asStr(transaction.subInvoiceNumber)) ?? null,
        vendorId: await vendorId(transaction.vendorName),
        date: asDate(transaction.date) ?? new Date(),
        type: asEnum(transaction.type, COST_TX_TYPES, 'ACTUAL'),
        source: asEnum(transaction.source, COST_TX_SOURCES, 'MANUAL'),
        description: asStr(transaction.description) || 'Restored transaction',
        reference: asStr(transaction.reference) || null,
        amount: asNum(transaction.amount),
        hours: asNullableNum(transaction.hours),
        needsCoding: transaction.needsCoding === true,
        notes: asStr(transaction.notes) || null,
        deletedAt: asDate(transaction.deletedAt),
      },
    })
    bump('costTransactions')
  }

  // ── Schedule of values and owner billing ───────────────────────────────
  const sovIdByNumber = new Map<string, string>()
  for (const sov of rows(doc.sovLines)) {
    const record = await prisma.sovLine.create({
      data: {
        projectId,
        number: asStr(sov.number),
        description: asStr(sov.description),
        scheduledValue: asNum(sov.scheduledValue),
        costCodeId: await costCodeId(sov.costCode),
        changeOrderNumber: asStr(sov.changeOrderNumber) || null,
        sortOrder: asNum(sov.sortOrder),
      },
    })
    sovIdByNumber.set(asStr(sov.number), record.id)
    bump('sovLines')
  }

  for (const billing of rows(doc.ownerBillings)) {
    const record = await prisma.ownerBilling.create({
      data: {
        projectId,
        appNumber: asNum(billing.appNumber),
        periodTo: asDate(billing.periodTo) ?? new Date(),
        dateSubmitted: asDate(billing.dateSubmitted),
        dateApproved: asDate(billing.dateApproved),
        datePaid: asDate(billing.datePaid),
        retainagePct: asNum(billing.retainagePct),
        amountPaid: asNum(billing.amountPaid),
        status: asEnum(billing.status, BILLING_STATUSES, 'DRAFT'),
        notes: asStr(billing.notes) || null,
      },
    })
    bump('ownerBillings')
    for (const line of rows(billing.lines)) {
      const sovLineId = sovIdByNumber.get(asStr(line.sovNumber))
      if (!sovLineId) {
        warnings.push(`Application ${asNum(billing.appNumber)} referenced SOV line ${asStr(line.sovNumber)}, which is missing.`)
        continue
      }
      await prisma.ownerBillingLine.create({
        data: {
          billingId: record.id,
          sovLineId,
          workThisPeriod: asNum(line.workThisPeriod),
          storedMaterials: asNum(line.storedMaterials),
        },
      })
    }
  }

  // ── Forecast, cash flow, quantities, snapshots ─────────────────────────
  for (const period of rows(doc.forecastPeriods)) {
    const record = await prisma.forecastPeriod.create({
      data: {
        projectId,
        periodEnd: asDate(period.periodEnd) ?? new Date(),
        status: asEnum(period.status, FORECAST_STATUSES, 'OPEN'),
        lockedAt: asDate(period.lockedAt),
        lockedBy: asStr(period.lockedBy) || null,
        notes: asStr(period.notes) || null,
      },
    })
    bump('forecastPeriods')
    for (const line of rows(period.lines)) {
      const id = await costCodeId(line.costCode)
      if (!id) continue
      await prisma.forecastLine.create({
        data: {
          periodId: record.id,
          costCodeId: id,
          currentBudget: asNum(line.currentBudget),
          costToDate: asNum(line.costToDate),
          committed: asNum(line.committed),
          accrued: asNum(line.accrued),
          remainingCommitment: asNum(line.remainingCommitment),
          pctComplete: asNum(line.pctComplete),
          etcOverride: asNullableNum(line.etcOverride),
          estimateToComplete: asNum(line.estimateToComplete),
          estimateAtCompletion: asNum(line.estimateAtCompletion),
          previousEac: asNum(line.previousEac),
          riskLevel: asEnum(line.riskLevel, RISK_LEVELS, 'LOW'),
          confidence: asNum(line.confidence) || 0.8,
          note: asStr(line.note) || null,
        },
      })
    }
  }

  for (const period of rows(doc.cashFlowPeriods)) {
    await prisma.cashFlowPeriod.create({
      data: {
        projectId,
        periodEnd: asDate(period.periodEnd) ?? new Date(),
        plannedDeltaPct: asNum(period.plannedDeltaPct),
        actualPctComplete: asNullableNum(period.actualPctComplete),
        actualCost: asNullableNum(period.actualCost),
        billingOverride: asNullableNum(period.billingOverride),
        collectionOverride: asNullableNum(period.collectionOverride),
        notes: asStr(period.notes) || null,
      },
    })
    bump('cashFlowPeriods')
  }

  for (const item of rows(doc.quantityItems)) {
    const record = await prisma.quantityItem.create({
      data: {
        projectId,
        description: asStr(item.description) || 'Restored work item',
        costCodeId: await costCodeId(item.costCode),
        uom: asStr(item.uom) || 'EA',
        budgetQty: asNum(item.budgetQty),
        budgetUnitRate: asNum(item.budgetUnitRate),
        materialOrderedQty: asNum(item.materialOrderedQty),
        targetFinish: asDate(item.targetFinish),
        notes: asStr(item.notes) || null,
        sortOrder: asNum(item.sortOrder),
      },
    })
    bump('quantityItems')
    for (const entry of rows(item.entries)) {
      await prisma.quantityEntry.create({
        data: {
          itemId: record.id,
          periodEnd: asDate(entry.periodEnd) ?? new Date(),
          installedQty: asNum(entry.installedQty),
          actualHours: asNum(entry.actualHours),
          crewDays: asNum(entry.crewDays),
          notes: asStr(entry.notes) || null,
        },
      })
    }
  }

  for (const snapshot of rows(doc.snapshots)) {
    await prisma.projectSnapshot.create({
      data: {
        projectId,
        asOf: asDate(snapshot.asOf) ?? new Date(),
        label: asStr(snapshot.label) || 'Restored snapshot',
        payload: asStr(snapshot.payload),
        createdBy: asStr(snapshot.createdBy) || null,
      },
    })
    bump('snapshots')
  }

  return { projectId, number, created, warnings }
}
