import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { today } from '@/lib/finance'
import { date, dateInput } from '@/lib/format'
import { EmptyState, Section } from '@/components/ui'
import { VendorManager } from '@/components/admin/vendor-manager'
import { RegionManager, type StateNode } from '@/components/admin/region-manager'
import { saveVendor, setVendorActive, deleteVendor } from '../actions'
import {
  saveVendorState,
  deleteVendorState,
  saveVendorRegion,
  deleteVendorRegion,
} from './regions-actions'

export const metadata = { title: 'Vendors' }

export default async function VendorsPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:reference_data')) forbidden()

  const [vendors, trades, states] = await Promise.all([
    prisma.vendor.findMany({
      where: { companyId: user.companyId },
      include: {
        trade: true,
        state: true,
        region: true,
        commitments: { include: { invoices: true, changes: true } },
        _count: { select: { commitments: true, invoices: true } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.trade.findMany({ where: { companyId: user.companyId, active: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.vendorState.findMany({
      where: { companyId: user.companyId },
      include: {
        regions: { include: { _count: { select: { vendors: true } } }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { vendors: true } },
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  const stateNodes: StateNode[] = states.map((state) => ({
    id: state.id,
    name: state.name,
    code: state.code,
    vendorCount: state._count.vendors,
    regions: state.regions.map((r) => ({ id: r.id, name: r.name, notes: r.notes, vendorCount: r._count.vendors })),
  }))
  const regionOptions = states.flatMap((state) =>
    state.regions.map((r) => ({ id: r.id, stateName: state.name, label: `${state.name} / ${r.name}` })),
  )

  // Whether cover has lapsed is a question about today, not about the
  // accounting period the financial figures are stated in.
  const asOf = today()

  const rows = vendors.map((v) => {
    const expirations = [v.glExpiration, v.wcExpiration, v.autoExpiration, v.umbrellaExpiration].filter((d): d is Date => d != null)
    const earliest = expirations.length ? new Date(Math.min(...expirations.map((d) => d.getTime()))) : null
    const coiStatus = !earliest
      ? 'MISSING'
      : earliest < asOf
        ? 'EXPIRED'
        : earliest.getTime() - asOf.getTime() < 30 * 86_400_000
          ? 'EXPIRING'
          : 'CURRENT'

    const contractValue = v.commitments.reduce(
      (a, c) => a + c.originalAmount + c.changes.filter((ch) => ch.status === 'APPROVED').reduce((s, ch) => s + ch.amount, 0),
      0,
    )
    const invoiced = v.commitments.reduce((a, c) => a + c.invoices.reduce((s, i) => s + i.amount, 0), 0)
    const paid = v.commitments.reduce((a, c) => a + c.invoices.reduce((s, i) => s + i.amountPaid, 0), 0)

    return {
      id: v.id,
      name: v.name,
      isSubcontractor: v.isSubcontractor,
      tradeId: v.tradeId,
      tradeName: v.trade?.name ?? null,
      active: v.active,
      stateId: v.stateId,
      stateName: v.state?.name ?? null,
      regionId: v.regionId,
      regionName: v.region?.name ?? null,
      contactName: v.contactName,
      phone: v.phone,
      email: v.email,
      address: v.address,
      w9OnFile: v.w9OnFile,
      glExpiration: dateInput(v.glExpiration),
      wcExpiration: dateInput(v.wcExpiration),
      autoExpiration: dateInput(v.autoExpiration),
      umbrellaExpiration: dateInput(v.umbrellaExpiration),
      earliestExpiration: earliest ? date(earliest) : '-',
      coiStatus,
      paymentHold: v.paymentHold,
      commitments: v._count.commitments,
      invoices: v._count.invoices,
      contractValue,
      invoiced,
      paid,
      outstanding: invoiced - paid,
    }
  })

  return (
    <div className="space-y-6">
      <Section
        title="Territory"
        description="States and the regions inside them. Assign a vendor to a region and the vendor list can be narrowed to the area a project is in."
      >
        <RegionManager
          states={stateNodes}
          saveState={saveVendorState}
          removeState={deleteVendorState}
          saveRegion={saveVendorRegion}
          removeRegion={deleteVendorRegion}
        />
      </Section>

      <Section
        title="Vendors and subcontractors"
        description="Financial and insurance records. Compliance holds set here block payment on every project."
      >
        {vendors.length === 0 ? (
          <EmptyState title="No vendors yet" description="Add the first one below." />
        ) : (
          <VendorManager
            vendors={rows}
            trades={trades.map((t) => ({ id: t.id, label: t.name }))}
            regions={regionOptions}
            canDelete={can(user.role, 'delete:records')}
            save={saveVendor}
            setActive={setVendorActive}
            remove={deleteVendor}
          />
        )}
      </Section>
    </div>
  )
}
