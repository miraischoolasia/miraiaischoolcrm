import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  MAX_RULES_PER_PAGE,
  createRule,
  getRuleFieldChoices,
  pageLabel,
  ruleOpLabels,
  ruleOpsFor,
} from '../../lib/formPages'
import type { FormField, FormPage, FormRule, FormRuleAction } from '../../types/domain'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#fc0c97] focus:outline-none'
const iconButton =
  'rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

type PagePanelProps = {
  pages: FormPage[]
  fields: FormField[]
  pageIndex: number
  onChange: (patch: Partial<FormPage>) => void
  onMove: (direction: 'left' | 'right') => void
  onDelete: () => void
}

// A page's title and description, where it sits, and the rules that decide
// where the visitor goes after it.
export function PagePanel({ pages, fields, pageIndex, onChange, onMove, onDelete }: PagePanelProps) {
  const page = pages[pageIndex]
  const choices = getRuleFieldChoices(pages, fields, pageIndex)
  const laterPages = pages.slice(pageIndex + 1)
  const isLast = pageIndex === pages.length - 1

  function updateRule(ruleId: string, patch: Partial<FormRule>) {
    onChange({ rules: page.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)) })
  }

  function moveRule(index: number, direction: -1 | 1) {
    const next = [...page.rules]
    const [moved] = next.splice(index, 1)
    next.splice(index + direction, 0, moved)
    onChange({ rules: next })
  }

  function addRule() {
    const rule = createRule(pages, fields, pageIndex)
    if (rule) {
      onChange({ rules: [...page.rules, rule] })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">{pageLabel(page, pageIndex)}</h2>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Move page left"
            disabled={pageIndex === 0}
            onClick={() => onMove('left')}
            className={iconButton}
          >
            <ArrowLeft size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Move page right"
            disabled={isLast}
            onClick={() => onMove('right')}
            className={iconButton}
          >
            <ArrowRight size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Delete page"
            disabled={pages.length === 1}
            onClick={onDelete}
            className="rounded-lg border border-red-200 p-2 text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="block text-sm font-medium text-slate-700">
        Page title
        <input
          type="text"
          value={page.title}
          maxLength={80}
          placeholder="Optional, shown above the questions"
          onChange={(event) => onChange({ title: event.target.value })}
          className={cn(inputClass, 'mt-1')}
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Page description
        <textarea
          rows={2}
          value={page.description}
          maxLength={300}
          placeholder="Optional"
          onChange={(event) => onChange({ description: event.target.value })}
          className={cn(inputClass, 'mt-1')}
        />
      </label>

      <div className="border-t border-slate-200 pt-4">
        <h3 className="text-sm font-semibold text-slate-900">Logic</h3>
        <p className="mt-1 text-xs text-slate-500">
          After this page, the first rule that matches decides where the visitor goes. With no match
          they go to the {isLast ? 'end of the form' : 'next page'}. Rules can only jump forward.
        </p>

        {choices.length === 0 && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Rules read a dropdown, single choice or multiple choice answer. Add one to this page or
            an earlier page first.
          </p>
        )}

        <ol className="mt-3 space-y-3">
          {page.rules.map((rule, index) => (
            <RuleRow
              key={rule.id}
              number={index + 1}
              rule={rule}
              choices={choices}
              laterPages={laterPages}
              pages={pages}
              isFirst={index === 0}
              isLastRule={index === page.rules.length - 1}
              onChange={(patch) => updateRule(rule.id, patch)}
              onMove={(direction) => moveRule(index, direction)}
              onRemove={() => onChange({ rules: page.rules.filter((entry) => entry.id !== rule.id) })}
            />
          ))}
        </ol>

        <button
          type="button"
          disabled={choices.length === 0 || page.rules.length >= MAX_RULES_PER_PAGE}
          onClick={addRule}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#be185d] hover:text-[#9d174d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add rule
        </button>
      </div>
    </div>
  )
}

function RuleRow({
  number,
  rule,
  choices,
  laterPages,
  pages,
  isFirst,
  isLastRule,
  onChange,
  onMove,
  onRemove,
}: {
  number: number
  rule: FormRule
  choices: FormField[]
  laterPages: FormPage[]
  pages: FormPage[]
  isFirst: boolean
  isLastRule: boolean
  onChange: (patch: Partial<FormRule>) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}) {
  const field = choices.find((entry) => entry.id === rule.fieldId)
  const actionValue = rule.action.type === 'page' ? `page:${rule.action.pageId}` : 'end'

  function changeField(fieldId: string) {
    const next = choices.find((entry) => entry.id === fieldId)
    if (next) {
      onChange({ fieldId, op: ruleOpsFor(next.type)[0], value: next.options[0] ?? '' })
    }
  }

  function changeAction(value: string) {
    const action: FormRuleAction = value.startsWith('page:')
      ? { type: 'page', pageId: value.slice(5) }
      : { type: 'end', ending: 'default', message: '', redirectUrl: '' }
    onChange({ action })
  }

  return (
    <li className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Rule {number}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label={`Move rule ${number} up`}
            disabled={isFirst}
            onClick={() => onMove(-1)}
            className={iconButton}
          >
            <ArrowUp size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Move rule ${number} down`}
            disabled={isLastRule}
            onClick={() => onMove(1)}
            className={iconButton}
          >
            <ArrowDown size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Remove rule ${number}`}
            onClick={onRemove}
            className={iconButton}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="block text-xs font-medium text-slate-600">
        If
        <select
          value={rule.fieldId}
          aria-label={`Rule ${number} question`}
          onChange={(event) => changeField(event.target.value)}
          className={cn(inputClass, 'mt-1')}
        >
          {!field && <option value={rule.fieldId}>(question is gone)</option>}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={rule.op}
          aria-label={`Rule ${number} condition`}
          onChange={(event) => onChange({ op: event.target.value as FormRule['op'] })}
          className={inputClass}
        >
          {(field ? ruleOpsFor(field.type) : [rule.op]).map((op) => (
            <option key={op} value={op}>
              {ruleOpLabels[op]}
            </option>
          ))}
        </select>
        <select
          value={rule.value}
          aria-label={`Rule ${number} answer`}
          onChange={(event) => onChange({ value: event.target.value })}
          className={inputClass}
        >
          {!field?.options.includes(rule.value) && (
            <option value={rule.value}>{rule.value || '(pick an option)'}</option>
          )}
          {(field?.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <label className="block text-xs font-medium text-slate-600">
        Then
        <select
          value={actionValue}
          aria-label={`Rule ${number} action`}
          onChange={(event) => changeAction(event.target.value)}
          className={cn(inputClass, 'mt-1')}
        >
          {laterPages.map((target) => (
            <option key={target.id} value={`page:${target.id}`}>
              Go to {pageLabel(target, pages.indexOf(target))}
            </option>
          ))}
          <option value="end">End the form here</option>
          {rule.action.type === 'page' &&
            !laterPages.some((target) => target.id === (rule.action as { pageId: string }).pageId) && (
              <option value={actionValue}>(page is gone or earlier)</option>
            )}
        </select>
      </label>
      {rule.action.type === 'end' && (
        <EndingEditor number={number} action={rule.action} onChange={(action) => onChange({ action })} />
      )}
    </li>
  )
}

function EndingEditor({
  number,
  action,
  onChange,
}: {
  number: number
  action: Extract<FormRuleAction, { type: 'end' }>
  onChange: (action: FormRuleAction) => void
}) {
  return (
    <div className="space-y-2">
      <select
        value={action.ending}
        aria-label={`Rule ${number} ending`}
        onChange={(event) =>
          onChange({ ...action, ending: event.target.value as typeof action.ending })
        }
        className={inputClass}
      >
        <option value="default">Use the form's usual ending</option>
        <option value="message">Show a different message</option>
        <option value="redirect">Go to a different web address</option>
      </select>
      {action.ending === 'message' && (
        <textarea
          rows={2}
          value={action.message}
          maxLength={300}
          aria-label={`Rule ${number} ending message`}
          placeholder="Shown instead of the usual thank-you message"
          onChange={(event) => onChange({ ...action, message: event.target.value })}
          className={inputClass}
        />
      )}
      {action.ending === 'redirect' && (
        <input
          type="url"
          value={action.redirectUrl}
          maxLength={500}
          aria-label={`Rule ${number} ending web address`}
          placeholder="https://yourwebsite.com/not-eligible"
          onChange={(event) => onChange({ ...action, redirectUrl: event.target.value })}
          className={inputClass}
        />
      )}
      <p className="text-xs text-slate-500">
        The visitor's answers are saved as usual; only what they see at the end changes.
      </p>
    </div>
  )
}
