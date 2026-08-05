import type { CostCategory } from '@/generated/prisma/client'
import { CATEGORY_LABELS, COST_CATEGORIES } from './finance/cost'

/**
 * Cost types are the one shared vocabulary across estimating, budgets, cost,
 * commitments, forecasting and reporting. They are deliberately few and
 * deliberately general: every line item on every project gets exactly one, so
 * the same eight buckets roll up cleanly no matter who entered the work.
 */

export { CATEGORY_LABELS, COST_CATEGORIES }

export const COST_TYPE_DESCRIPTIONS: Record<CostCategory, string> = {
  LABOR: 'Wages for your own crews, including burden. Anything a person on your payroll is paid to do.',
  MATERIAL: 'Anything you buy that stays in the building. Lumber, concrete, fixtures, finishes.',
  EQUIPMENT: 'Rented or owned equipment, fuel and operating cost. Cranes, lifts, excavators, small tools.',
  SUBCONTRACT: 'Work bought from another company under contract, priced as a scope rather than by the hour.',
  GENERAL_CONDITIONS: 'The cost of running the job itself. Supervision, trailer, temporary power, cleanup, safety.',
  OVERHEAD: 'Company cost carried by the project. Insurance, bonds, fees and the office allocation.',
  CONTINGENCY: 'Money held back for what has not been identified yet. Drawn down as risks turn into real cost.',
  OTHER: 'Anything that genuinely does not belong in the buckets above. Keep this one small.',
}

/** A short hint used in dropdowns, where there is no room for the full line. */
export const COST_TYPE_HINTS: Record<CostCategory, string> = {
  LABOR: 'Your own crews',
  MATERIAL: 'Purchased materials',
  EQUIPMENT: 'Rented or owned plant',
  SUBCONTRACT: 'Contracted scopes',
  GENERAL_CONDITIONS: 'Running the job',
  OVERHEAD: 'Company cost on the job',
  CONTINGENCY: 'Held for the unknown',
  OTHER: 'Everything else',
}

/** Options for a cost type dropdown, in the order they should be offered. */
export function costTypeOptions(): { value: CostCategory; label: string; hint: string }[] {
  return COST_CATEGORIES.map((value) => ({
    value,
    label: CATEGORY_LABELS[value],
    hint: COST_TYPE_HINTS[value],
  }))
}

/** Reads a cost type off a form, falling back to Other rather than throwing. */
export function parseCostType(value: FormDataEntryValue | null | undefined): CostCategory {
  const text = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return (COST_CATEGORIES as string[]).includes(text) ? (text as CostCategory) : 'OTHER'
}

export function costTypeLabel(value: string | null | undefined): string {
  if (!value) return 'Unassigned'
  return CATEGORY_LABELS[value as CostCategory] ?? value
}
