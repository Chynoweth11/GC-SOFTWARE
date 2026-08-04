import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { EmptyState, InfoNote, Section } from '@/components/ui'
import { ClientManager, type ClientRow } from '@/components/admin/client-manager'
import { saveClient, setClientActive, deleteClient } from './actions'

export const metadata = { title: 'Clients' }

export default async function ClientsPage() {
  const user = await requireUser()
  if (!can(user.role, 'manage:clients')) forbidden()

  const clients = await prisma.client.findMany({
    where: { companyId: user.companyId },
    include: {
      projects: { select: { originalContractSum: true } },
      _count: { select: { projects: true, bids: true } },
    },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
  })

  const rows: ClientRow[] = clients.map((client) => ({
    id: client.id,
    name: client.name,
    type: client.type,
    active: client.active,
    contact: client.contact,
    phone: client.phone,
    email: client.email,
    address: client.address,
    notes: client.notes,
    projectCount: client._count.projects,
    bidCount: client._count.bids,
    contractValue: client.projects.reduce((total, p) => total + p.originalContractSum, 0),
  }))

  return (
    <div className="space-y-6">
      <Section
        title="Clients"
        description="The owners you contract with. Every project and bid points at one of these records."
      >
        <InfoNote>
          A client with projects or bids is archived rather than deleted, so the owner named on an issued contract or pay
          application never disappears. Clients with no history can be removed outright. Both are recorded permanently in the
          audit history.
        </InfoNote>
        <div className="mt-3">
          {rows.length === 0 ? (
            <EmptyState title="No clients yet" description="Add the first client to start assigning projects and bids to it." />
          ) : null}
          <ClientManager
            clients={rows}
            canDelete={can(user.role, 'delete:records')}
            save={saveClient}
            setActive={setClientActive}
            remove={deleteClient}
          />
        </div>
      </Section>
    </div>
  )
}
