import { Check, Image as ImageIcon, Rows, TextAa } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import {
  CONTENT_SIZES,
  MAX_PER_KIND,
  SIZE_LABELS,
  totalCount,
  type BriefDraft,
  type ContentKind,
  type StudioAngle,
  type StudioStyle,
} from '../../lib/contentStudio'
import { cn } from '../../lib/cn'
import { NumberStepper, Section } from './ui'

type StepMakeProps = {
  draft: BriefDraft
  styles: StudioStyle[]
  angles: StudioAngle[]
  canEdit: boolean
  usage: { used: number; limit: number } | null
  onChange: (draft: BriefDraft) => void
}

function toggle(list: number[], value: number) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

// A card that can be picked (a style or an angle).
function PickCard({ picked, title, text, onClick, disabled }: { picked: boolean; title: string; text: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={picked}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex h-full min-h-24 w-full flex-col rounded-2xl border-2 p-3 text-left transition-colors disabled:cursor-not-allowed',
        picked ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold text-slate-900">{title}</span>
        <span
          className={cn(
            'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
            picked ? 'border-[#fc0c97] bg-[#fc0c97] text-white' : 'border-slate-300 bg-white',
          )}
        >
          {picked && <Check size={12} weight="bold" />}
        </span>
      </span>
      <span className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">{text}</span>
    </button>
  )
}

const KIND_ROWS: { kind: ContentKind; title: string; text: string; icon: ReactNode }[] = [
  { kind: 'single', title: 'Single posters', text: 'One picture with words on it.', icon: <ImageIcon size={20} /> },
  { kind: 'carousel', title: 'Carousels', text: 'Several pages people swipe through.', icon: <Rows size={20} /> },
  { kind: 'caption', title: 'Captions only', text: 'Just the post text, no picture.', icon: <TextAa size={20} /> },
]

// Step 2: the look (styles), what the posts talk about (angles), sizes, and how many of each type.
export function StepMake({ draft, styles, angles, canEdit, usage, onChange }: StepMakeProps) {
  const shownStyles = styles.filter((style) => !style.hidden || draft.styleIds.includes(style.id))
  const shownAngles = angles.filter((angle) => !angle.hidden || draft.angleIds.includes(angle.id))
  const total = totalCount(draft.counts)
  const left = usage ? Math.max(0, usage.limit - usage.used) : null
  const disabled = !canEdit

  return (
    <div className="space-y-5">
      <Section
        title="How many posts?"
        description="Set each type on its own. You can add more ideas later."
        action={
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{total}</p>
            <p className="text-xs text-slate-500">post ideas in all</p>
          </div>
        }
      >
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
          {KIND_ROWS.map((row) => (
            <li key={row.kind} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1f8] text-[#be185d]">{row.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">{row.title}</span>
                <span className="block text-sm text-slate-500">{row.text}</span>
              </span>
              {row.kind === 'carousel' && draft.counts.carousel > 0 && (
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  Pages each
                  <NumberStepper label="Pages in each carousel" value={draft.carouselPages} min={2} max={10} disabled={disabled} onChange={(value) => onChange({ ...draft, carouselPages: value })} />
                </span>
              )}
              <NumberStepper
                label={row.title}
                value={draft.counts[row.kind]}
                max={MAX_PER_KIND}
                disabled={disabled}
                onChange={(value) => onChange({ ...draft, counts: { ...draft.counts, [row.kind]: value } })}
              />
            </li>
          ))}
        </ul>
        {left !== null && (
          <p className={cn('mt-3 text-sm', total > left ? 'text-amber-700' : 'text-slate-500')}>
            The AI can write {left} more today (school limit {usage?.limit}).
            {total > left ? ' Lower the numbers or ask an admin to raise the limit.' : ''}
          </p>
        )}
      </Section>

      <Section title="Sizes" description="Each post gets one of the sizes you pick, taking turns.">
        <div className="flex flex-wrap gap-2">
          {CONTENT_SIZES.map((size) => {
            const picked = draft.sizes.includes(size)
            return (
              <button
                key={size}
                type="button"
                role="checkbox"
                aria-checked={picked}
                disabled={disabled || (picked && draft.sizes.length === 1)}
                onClick={() => onChange({ ...draft, sizes: CONTENT_SIZES.filter((entry) => (entry === size ? !picked : draft.sizes.includes(entry))) })}
                className={cn(
                  'min-h-11 rounded-xl border-2 px-4 text-sm font-semibold transition-colors',
                  picked ? 'border-[#fc0c97] bg-[#fff1f8] text-[#be185d]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                )}
              >
                {SIZE_LABELS[size]}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title={`Styles · ${draft.styleIds.length} picked`} description="How the posts look. Pick one or more; the posts take turns.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shownStyles.map((style) => (
            <PickCard key={style.id} picked={draft.styleIds.includes(style.id)} title={style.name} text={style.description} disabled={disabled} onClick={() => onChange({ ...draft, styleIds: toggle(draft.styleIds, style.id) })} />
          ))}
        </div>
      </Section>

      <Section title={`Angles · ${draft.angleIds.length} picked`} description="What the posts talk about. Every style is paired with every angle before any pair repeats.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shownAngles.map((angle) => (
            <PickCard key={angle.id} picked={draft.angleIds.includes(angle.id)} title={angle.name} text={angle.description} disabled={disabled} onClick={() => onChange({ ...draft, angleIds: toggle(draft.angleIds, angle.id) })} />
          ))}
        </div>
      </Section>
    </div>
  )
}
