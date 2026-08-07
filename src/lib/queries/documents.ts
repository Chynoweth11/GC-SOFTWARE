import 'server-only'
import { cache } from 'react'
import { prisma } from '@/lib/db'
import {
  deriveDocument,
  documentTotals,
  originalContractValue,
  today,
  type DocumentDerived,
  type DocumentTotals,
  type LaborRateEntry,
} from '@/lib/finance'
import { getLaborClassifications } from './labor'

/**
 * Contract documents, priced and read back.
 *
 * Nothing about a document's money is stored except what somebody typed: the
 * quantities, the unit costs, the markup percentages. Every total, every
 * markup step and every question about whether it counts is worked out here on
 * the way to the screen, so the summary row on the tab, the breakdown behind
 * it, the contract value on the dashboard and the figure in an export cannot
 * disagree with one another.
 */

function loadDocuments(where: { projectId?: string; id?: string; companyId: string }) {
  return prisma.changeOrder.findMany({
    where: {
      ...(where.id ? { id: where.id } : {}),
      ...(where.projectId ? { projectId: where.projectId } : {}),
      project: { companyId: where.companyId },
    },
    include: {
      project: { select: { id: true, number: true, name: true } },
      trade: { select: { name: true } },
      approvedBy: { select: { name: true } },
      supersededBy: { select: { id: true, number: true } },
      signatures: { orderBy: { sortOrder: 'asc' } },
      attachments: { include: { uploadedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      lines: { include: { costCode: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    },
    orderBy: [{ documentKind: 'asc' }, { number: 'asc' }],
  })
}

type DocumentRecord = Awaited<ReturnType<typeof loadDocuments>>[number]

export interface DocumentView extends DocumentDerived {
  projectId: string
  projectNumber: string
  projectName: string
  tradeName: string | null
  tradeId: string | null
  origin: string | null
  counterparty: string | null
  reference: string | null
  notes: string | null
  unapprovedReason: string | null
  supersededByNumber: string | null
  supersededById: string | null
  anticipatedApproval: Date | null
  dateSubmitted: Date | null
  signatureRows: {
    id: string
    party: string
    role: string | null
    email: string | null
    status: string
    signedAt: Date | null
    note: string | null
  }[]
  attachments: {
    id: string
    kind: string
    fileName: string
    location: string | null
    note: string | null
    uploadedByName: string | null
    createdAt: Date
  }[]
  lineRecords: {
    id: string
    costCodeId: string
    costCodeLabel: string
    category: string
    description: string
    scope: string | null
    divisionCode: string | null
    measure: string
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
    otherUnitCost: number
    notes: string | null
  }[]
}

function viewFromRecord(
  record: DocumentRecord,
  laborRates: ReadonlyMap<string, LaborRateEntry>,
  dataDate: Date,
): DocumentView {
  const derived = deriveDocument(
    {
      id: record.id,
      number: record.number,
      documentKind: record.documentKind,
      type: record.type,
      status: record.status,
      description: record.description,
      priceFromLines: record.priceFromLines,
      enteredOwnerAmount: record.enteredOwnerAmount,
      enteredCostAmount: record.enteredCostAmount,
      markups: {
        laborBurdenPct: record.laborBurdenPct,
        salesTaxPct: record.salesTaxPct,
        smallToolsPct: record.smallToolsPct,
        contingencyPct: record.contingencyPct,
        overheadPct: record.overheadPct,
        profitPct: record.profitPct,
        glInsurancePct: record.glInsurancePct,
        bondPct: record.bondPct,
        exciseTaxPct: record.exciseTaxPct,
        roundToNearest: record.roundToNearest,
      },
      probabilityPct: record.probabilityPct,
      scheduleImpactDays: record.scheduleImpactDays,
      dateInitiated: record.dateInitiated,
      dateApproved: record.dateApproved,
      sentForSignatureAt: record.sentForSignatureAt,
      fullySignedAt: record.fullySignedAt,
      approvedAt: record.approvedAt,
      approvedByName: record.approvedBy?.name ?? null,
      approvalCertification: record.approvalCertification,
      postsToBudget: record.postsToBudget,
      signatures: record.signatures.map((signature) => ({
        party: signature.party,
        status: signature.status,
        signedAt: signature.signedAt,
      })),
      attachmentCount: record.attachments.length,
      signedDocumentCount: record.attachments.filter((a) => a.kind === 'SIGNED_DOCUMENT').length,
    },
    record.lines.map((line) => ({
      id: line.id,
      costCodeId: line.costCodeId,
      costCodeLabel: `${line.costCode.code} ${line.costCode.description}`,
      category: line.category,
      divisionCode: line.divisionCode,
      description: line.description ?? line.costCode.description,
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
    })),
    laborRates,
    dataDate,
  )

  return {
    ...derived,
    projectId: record.projectId,
    projectNumber: record.project.number,
    projectName: record.project.name,
    tradeName: record.trade?.name ?? null,
    tradeId: record.tradeId,
    origin: record.origin,
    counterparty: record.counterparty,
    reference: record.reference,
    notes: record.notes,
    unapprovedReason: record.unapprovedReason,
    supersededByNumber: record.supersededBy?.number ?? null,
    supersededById: record.supersededById,
    anticipatedApproval: record.anticipatedApproval,
    dateSubmitted: record.dateSubmitted,
    signatureRows: record.signatures.map((signature) => ({
      id: signature.id,
      party: signature.party,
      role: signature.role,
      email: signature.email,
      status: signature.status,
      signedAt: signature.signedAt,
      note: signature.note,
    })),
    attachments: record.attachments.map((attachment) => ({
      id: attachment.id,
      kind: attachment.kind,
      fileName: attachment.fileName,
      location: attachment.location,
      note: attachment.note,
      uploadedByName: attachment.uploadedBy?.name ?? null,
      createdAt: attachment.createdAt,
    })),
    lineRecords: record.lines.map((line) => ({
      id: line.id,
      costCodeId: line.costCodeId,
      costCodeLabel: `${line.costCode.code} ${line.costCode.description}`,
      category: line.category,
      description: line.description ?? line.costCode.description,
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
    })),
  }
}

/**
 * The company classification library, as a rate table a document prices from.
 *
 * The same map the estimate uses, so a change order line that names a
 * classification gets its loaded rate and does not take a flat burden on top
 * of it.
 */
const laborRateTable = cache(async (companyId: string): Promise<Map<string, LaborRateEntry>> => {
  const classes = await getLaborClassifications(companyId)
  return new Map(
    classes.map((entry) => [
      entry.name,
      { rate: entry.loadedHourlyCost, burdened: true, source: `Classification library: ${entry.name}` },
    ]),
  )
})

export interface ProjectDocuments {
  documents: DocumentView[]
  totals: DocumentTotals
  /** The same four totals for each kind, so contracts read apart from changes. */
  byKind: { kind: string; label: string; totals: DocumentTotals; documents: DocumentView[] }[]
  original: ReturnType<typeof originalContractValue>
}

export const getProjectDocuments = cache(
  async (projectId: string, companyId: string): Promise<ProjectDocuments> => {
    const [project, records, rates] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, companyId },
        select: { dataDate: true, originalContractSum: true },
      }),
      loadDocuments({ projectId, companyId }),
      laborRateTable(companyId),
    ])
    if (!project) {
      return {
        documents: [],
        totals: documentTotals([]),
        byKind: [],
        original: originalContractValue([], 0),
      }
    }

    const dataDate = project.dataDate ?? today()
    const documents = records.map((record) => viewFromRecord(record, rates, dataDate))

    const kinds = [...new Set(documents.map((document) => document.documentKind))]
    const byKind = kinds.map((kind) => {
      const matching = documents.filter((document) => document.documentKind === kind)
      return {
        kind,
        label: KIND_LABELS[kind] ?? kind,
        totals: documentTotals(matching),
        documents: matching,
      }
    })

    return {
      documents,
      totals: documentTotals(documents),
      byKind,
      original: originalContractValue(documents, project.originalContractSum),
    }
  },
)

const KIND_LABELS: Record<string, string> = {
  CHANGE_ORDER: 'Change orders',
  CONTRACT: 'Contracts',
  CONTRACT_AMENDMENT: 'Contract amendments',
  ADDENDUM: 'Addendums',
  OWNER_CHANGE: 'Owner changes',
  SUBCONTRACT_CHANGE: 'Subcontract changes',
  OTHER: 'Other documents',
}

export const getProjectDocument = cache(
  async (documentId: string, companyId: string): Promise<DocumentView | null> => {
    const records = await loadDocuments({ id: documentId, companyId })
    const record = records[0]
    if (!record) return null

    const [project, rates] = await Promise.all([
      prisma.project.findUniqueOrThrow({
        where: { id: record.projectId },
        select: { dataDate: true },
      }),
      laborRateTable(companyId),
    ])

    return viewFromRecord(record, rates, project.dataDate ?? today())
  },
)

/** Everything ever recorded about one document, newest first. */
export const getDocumentHistory = cache(async (documentId: string, companyId: string) => {
  const lineIds = await prisma.changeOrderLine.findMany({
    where: { changeOrderId: documentId },
    select: { id: true },
  })
  const signatureIds = await prisma.documentSignature.findMany({
    where: { changeOrderId: documentId },
    select: { id: true },
  })
  const attachmentIds = await prisma.documentAttachment.findMany({
    where: { changeOrderId: documentId },
    select: { id: true },
  })

  /*
    History is gathered by identifier rather than by entity name, because a
    document's story includes what happened to its lines, its signatures and its
    attachments. A deleted line's entries are not gathered, which is honest:
    they are still in the history under the document itself, since deleting a
    line records an entry against the line and one against the document.
  */
  return prisma.auditLog.findMany({
    where: {
      companyId,
      OR: [
        { entity: 'ChangeOrder', entityId: documentId },
        { entity: 'ChangeOrderLine', entityId: { in: lineIds.map((line) => line.id) } },
        { entity: 'DocumentSignature', entityId: { in: signatureIds.map((signature) => signature.id) } },
        { entity: 'DocumentAttachment', entityId: { in: attachmentIds.map((attachment) => attachment.id) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
})
