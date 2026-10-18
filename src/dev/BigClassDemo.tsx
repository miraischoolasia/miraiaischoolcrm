import { StudentGrid, type GridChild } from '../components/console/StudentGrid'

// Dev server only: /?demo=bigclass shows the live class console's children
// grid with 200 made-up children (&count=20 for a small class); no login,
// nothing saved.
const first = ['Lim', 'Tan', 'Ng', 'Wong', 'Lee', 'Chan', 'Ong', 'Teoh', 'Goh', 'Yap']
const second = ['Wei', 'Jia', 'Zi', 'Xin', 'Yu', 'Kai', 'Hui', 'Min', 'Jun', 'Le']
const third = ['Hao', 'En', 'Yan', 'Ying', 'Xuan', 'Seng', 'Qing', 'Fei', 'Ting', 'Ming']

function makeChildren(count: number): GridChild[] {
  return Array.from({ length: count }, (_, index) => {
    const roll = (index * 37) % 100
    const state: GridChild['state'] = roll < 6 ? 'not_yet' : roll < 8 ? 'waiting' : roll < 10 ? 'left' : 'here'
    const answer: GridChild['answer'] = state !== 'here' ? 'none' : roll < 70 ? 'right' : roll < 80 ? 'wrong' : roll < 86 ? 'pending' : 'none'
    return {
      studentId: index + 1,
      name: `${first[index % 10]} ${second[Math.floor(index / 10) % 10]} ${third[(index * 7) % 10]}`,
      state,
      late: state === 'here' && roll % 9 === 0,
      dropped: state === 'left',
      answer,
      points: answer === 'right' ? 10 + (roll % 6) : 0,
      note: index % 23 === 0 ? 'Helped a friend' : null,
      picked: index === 42,
      background: null,
      remindedAt: null,
      canRemind: state === 'not_yet',
    }
  })
}

const count = Math.min(300, Math.max(1, Number(new URLSearchParams(window.location.search).get('count')) || 200))
const children = makeChildren(count)
const nothing = async () => null
const presets = [
  { id: 1, label: 'Great answer', points: 5, emoji: '🌟', sortOrder: 1, isActive: true },
  { id: 2, label: 'Helping others', points: 3, emoji: '🤝', sortOrder: 2, isActive: true },
  { id: 3, label: 'Homework done', points: 5, emoji: '📚', sortOrder: 3, isActive: true },
  { id: 4, label: 'Super focus', points: 3, emoji: '🎯', sortOrder: 4, isActive: true },
]

export function BigClassDemo() {
  return (
    <main className="min-h-screen bg-slate-50 p-4">
      <section className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Children ({count}, made up)</h3>
        <StudentGrid items={children} presets={presets} onGive={nothing} onSaveNote={nothing} onRemind={nothing} onStar={() => {}} />
      </section>
    </main>
  )
}
