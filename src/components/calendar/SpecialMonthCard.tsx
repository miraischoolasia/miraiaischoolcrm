import { cn } from '../../lib/cn'
import { SPECIAL_LABEL, type SpecialCard, type SpecialKind } from '../../lib/calendarSpecial'

// The colour of each kind of special day on the month calendar: cancelled pink, replacement green, extra class
// blue, booked trial teal. A weekly class (when the school shows them) is faded, so the special days stand out.
const TONE: Record<SpecialKind, string> = {
  cancel: 'border-l-rose-500 bg-rose-50 hover:bg-rose-100',
  replacement: 'border-l-emerald-500 bg-emerald-50 hover:bg-emerald-100',
  extra: 'border-l-blue-600 bg-blue-50 hover:bg-blue-100',
  trial: 'border-l-teal-500 bg-teal-50 hover:bg-teal-100',
  weekly: 'border-l-slate-300 bg-slate-50/70 hover:bg-slate-100',
  orphan: 'border-l-red-600 bg-red-100 hover:bg-red-200',
}

// One special class day on the month calendar: the time, then the grade, subject and teacher. A cancelled day
// carries a dot: green when it is made up (hover it for when), grey when nothing is arranged yet.
export function SpecialMonthCard({ card, done = false }: { card: SpecialCard; done?: boolean }) {
  const summary = [card.line, card.teacher].filter(Boolean).join(' ')
  const dotText = card.kind === 'cancel' ? (card.madeUp ?? 'No replacement yet') : null

  return (
    <div
      data-special-kind={card.kind}
      title={[`${SPECIAL_LABEL[card.kind]} · ${card.time} ${summary}`, dotText].filter(Boolean).join('\n')}
      className={cn(
        'relative w-full rounded-md border-l-[3px] py-1 pl-1.5 text-left transition',
        card.kind === 'weekly' ? 'text-slate-500' : 'text-slate-800',
        card.kind === 'cancel' ? 'pr-5' : 'pr-1.5',
        TONE[card.kind],
        done && 'opacity-70',
      )}
    >
      <span className="sr-only">{SPECIAL_LABEL[card.kind]}: </span>
      <span className={cn('block truncate text-[11px] leading-tight', card.kind === 'weekly' ? 'font-semibold' : 'font-bold')}>
        {card.time}
      </span>
      <span className={cn('block truncate text-[10.5px] leading-tight', card.kind === 'weekly' ? 'text-slate-400' : 'text-slate-600')}>
        {summary}
      </span>
      {dotText !== null && (
        <span
          role="img"
          aria-label={dotText}
          className={cn(
            'absolute right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border',
            card.madeUp ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 bg-white',
          )}
        />
      )}
    </div>
  )
}
