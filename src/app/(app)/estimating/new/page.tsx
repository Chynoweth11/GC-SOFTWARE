import Link from 'next/link'
import { forbidden } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { PageHeader, Section } from '@/components/ui'
import { NewEstimateForm } from '@/components/estimating/new-estimate-form'
import { createEstimate } from './actions'

export const metadata = { title: 'New estimate' }

export default async function NewEstimatePage() {
  const user = await requireUser()
  if (!can(user.role, 'edit:estimates')) forbidden()

  return (
    <>
      <PageHeader
        title="New estimate"
        subtitle="Only what is needed to open the estimate. Rates, markups and the bid build-up are set on its own tabs."
        actions={
          <Link href="/estimating" className="btn btn-ghost">
            Back to estimates
          </Link>
        }
      />
      <Section>
        <NewEstimateForm estimator={user.name} create={createEstimate} />
      </Section>
    </>
  )
}
