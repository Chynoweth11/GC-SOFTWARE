import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getEstimateBundle } from '@/lib/queries/estimate'
import { dateInput, money, percent } from '@/lib/format'
import { EmptyState, Section, DataList } from '@/components/ui'
import { EstimateSetupForm } from '@/components/estimating/estimate-setup-form'
import { LaborRateForm } from '@/components/estimating/labor-rate-form'
import { updateEstimateSetup, saveLaborRate } from '../actions'

export default async function EstimateSetupPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser()
  const { id } = await params
  const bundle = await getEstimateBundle(id, user.companyId)
  if (!bundle) notFound()

  const { estimate, summary } = bundle
  const canEdit = can(user.role, 'edit:estimates') && !estimate.lockedAt
  const showRates = can(user.role, 'view:labor_rates')

  return (
    <div className="space-y-6">
      <Section title="Estimate setup and markups" description="Every rate, factor and markup used by the takeoff and bid summary lives here">
        {canEdit ? (
          <EstimateSetupForm
            action={updateEstimateSetup}
            estimate={{
              id: estimate.id,
              name: estimate.name,
              status: estimate.status,
              clientName: estimate.clientName,
              architect: estimate.architect,
              address: estimate.address,
              projectType: estimate.projectType,
              bidDueDate: dateInput(estimate.bidDueDate),
              estimator: estimate.estimator,
              drawingSet: estimate.drawingSet,
              addenda: estimate.addenda,
              durationWeeks: estimate.durationWeeks,
              buildingAreaSf: estimate.buildingAreaSf,
              laborBurdenPct: estimate.laborBurdenPct,
              salesTaxPct: estimate.salesTaxPct,
              smallToolsPct: estimate.smallToolsPct,
              contingencyPct: estimate.contingencyPct,
              overheadPct: estimate.overheadPct,
              profitPct: estimate.profitPct,
              glInsurancePct: estimate.glInsurancePct,
              bondPct: estimate.bondPct,
              exciseTaxPct: estimate.exciseTaxPct,
              roundToNearest: estimate.roundToNearest,
            }}
            showMarkups={can(user.role, 'view:markups')}
          />
        ) : (
          <div className="card p-4">
            <DataList
              columns={3}
              items={[
                { label: 'Client', value: estimate.clientName ?? '—' },
                { label: 'Architect', value: estimate.architect ?? '—' },
                { label: 'Drawing set', value: estimate.drawingSet ?? '—' },
                { label: 'Addenda acknowledged', value: estimate.addenda ?? '—' },
                { label: 'Duration', value: `${estimate.durationWeeks} weeks` },
                { label: 'Building area', value: `${estimate.buildingAreaSf} SF` },
                { label: 'Labor burden', value: percent(estimate.laborBurdenPct, 1) },
                { label: 'Sales tax', value: percent(estimate.salesTaxPct, 1) },
                { label: 'Small tools', value: percent(estimate.smallToolsPct, 1) },
              ]}
            />
          </div>
        )}
      </Section>

      {showRates && (
        <Section title="Labor rates" description="Bare hourly rates; the takeoff burdens them at the rate above">
          {estimate.laborRates.length === 0 ? (
            <EmptyState title="No labor rates set" description="Add the classes this estimate prices labour against." />
          ) : (
            <div className="card-flush mb-3">
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Labor class</th>
                      <th className="num">Bare rate</th>
                      <th className="num">Burdened rate</th>
                      <th className="num">Hours used in this estimate</th>
                      <th className="num">Labor cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.laborRates.map((r) => {
                      const used = summary.items.filter((i) => i.laborClass === r.className)
                      return (
                        <tr key={r.id}>
                          <td className="font-medium">{r.className}</td>
                          <td className="num">{money(r.rate, { cents: true })}</td>
                          <td className="num calculated">{money(r.rate * (1 + estimate.laborBurdenPct), { cents: true })}</td>
                          <td className="num">{used.reduce((a, i) => a + i.laborHours, 0).toFixed(1)}</td>
                          <td className="num">{money(used.reduce((a, i) => a + i.laborCost, 0))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Total</td>
                      <td className="num">{summary.laborHours.toFixed(1)}</td>
                      <td className="num">{money(summary.costMix.labor)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {canEdit && <LaborRateForm estimateId={estimate.id} action={saveLaborRate} existing={estimate.laborRates.map((r) => r.className)} />}
        </Section>
      )}
    </div>
  )
}
