import { ArrowLeft, Plus } from '@phosphor-icons/react'
import { FLOW_RECIPES, type FlowRecipe } from '../../lib/flowSteps'
import type { AutomationContact } from '../../lib/automationContacts'
import { cn } from '../../lib/cn'

type RecipePickerProps = {
  contacts: AutomationContact[]
  onPick: (recipe: FlowRecipe | null) => void
  onBack: () => void
}

// Where a new flow starts: a flow that is already written (change the words and switch it on), or a
// blank one.
export function RecipePicker({ contacts, onPick, onBack }: RecipePickerProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Automations
        </button>
      </div>
      <div>
        <h2 className="text-base font-bold text-slate-900">Start a new flow</h2>
        <p className="mt-0.5 text-sm text-slate-600">Pick one that is already written, then change the words.</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {FLOW_RECIPES.map((recipe) => {
          const blocked = recipe.toTeam === true && contacts.length === 0
          return (
            <li key={recipe.key}>
              <button
                type="button"
                disabled={blocked}
                onClick={() => onPick(recipe)}
                className={cn(
                  'block h-full w-full rounded-xl border border-slate-200 bg-white p-4 text-left',
                  blocked ? 'opacity-60' : 'hover:border-[#fc0c97] hover:bg-[#fff8fc]',
                )}
              >
                <span className="block text-sm font-semibold text-slate-900">{recipe.title}</span>
                <span className="mt-1 block text-xs text-slate-600">{recipe.summary}</span>
                {blocked && (
                  <span className="mt-2 block text-xs font-semibold text-amber-700">
                    Add yourself under Contacts first, so it knows who to tell.
                  </span>
                )}
              </button>
            </li>
          )
        })}
        <li>
          <button
            type="button"
            onClick={() => onPick(null)}
            className="flex h-full w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
            Start with a blank flow
          </button>
        </li>
      </ul>
    </section>
  )
}
