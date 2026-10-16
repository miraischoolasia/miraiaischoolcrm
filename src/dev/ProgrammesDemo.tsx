import { useState } from 'react'
import { ProgrammesView } from '../components/sections/ProgrammesSection'
import type { ProgrammesState } from '../hooks/useProgrammes'
import { DEFAULT_STEPS, type Programme, type ProgrammeStep } from '../lib/programmes'

// Only the dev server shows this (/?demo=programmes): the Programmes page working on made-up programmes held
// in the page, with no login and no database, to look at it and try it.

const hoa: Programme = {
  id: 1,
  name: 'HOA class',
  legacyKey: 'hoa',
  outcome: 'booking',
  messageTemplate: '',
  isActive: true,
  sortOrder: 10,
  steps: [
    { id: 1, programmeId: 1, sortOrder: 10, kind: 'form', title: 'Registration form' },
    { id: 2, programmeId: 1, sortOrder: 20, kind: 'class', title: 'Book an HOA class' },
    { id: 3, programmeId: 1, sortOrder: 30, kind: 'receipt', title: 'Payment receipt' },
    { id: 4, programmeId: 1, sortOrder: 40, kind: 'zoom', title: 'Zoom with the parent' },
  ],
}

const maths: Programme = {
  id: 2,
  name: 'Maths tuition',
  legacyKey: null,
  outcome: 'enrol',
  messageTemplate: '你好，{child} 的数学班已经安排在 {class_time}。\n\n报名表：{form_link}',
  isActive: true,
  sortOrder: 20,
  steps: [
    { id: 5, programmeId: 2, sortOrder: 10, kind: 'form', title: 'Registration form' },
    { id: 6, programmeId: 2, sortOrder: 20, kind: 'custom', title: 'Placement test' },
    { id: 7, programmeId: 2, sortOrder: 30, kind: 'class', title: 'Pick a class' },
  ],
}

function useFakeProgrammes(): ProgrammesState {
  const [programmes, setProgrammes] = useState<Programme[]>([hoa, maths])
  const [nextId, setNextId] = useState(100)

  const change = (id: number, edit: (programme: Programme) => Programme) =>
    setProgrammes((current) => current.map((entry) => (entry.id === id ? edit(entry) : entry)))

  return {
    programmes,
    isLoading: false,
    error: null,
    reload: async () => undefined,
    add: async (name) => {
      if (!name.trim()) {
        return { error: 'Give the programme a name.', programme: null }
      }
      const id = nextId
      const created: Programme = {
        id,
        name: name.trim(),
        legacyKey: null,
        outcome: 'booking',
        messageTemplate: '',
        isActive: true,
        sortOrder: id,
        steps: DEFAULT_STEPS.map((step, index) => ({ id: id + index + 1, programmeId: id, sortOrder: (index + 1) * 10, ...step })),
      }
      setNextId(id + 10)
      setProgrammes((current) => [...current, created])
      return { error: null, programme: created }
    },
    save: async (id, draft) => {
      change(id, (programme) => ({ ...programme, ...draft, name: draft.name.trim() }))
      return null
    },
    remove: async (id) => {
      setProgrammes((current) => current.filter((entry) => entry.id !== id))
      return null
    },
    move: async (id, direction) => {
      setProgrammes((current) => {
        const from = current.findIndex((entry) => entry.id === id)
        const to = from + direction
        if (from < 0 || to < 0 || to >= current.length) {
          return current
        }
        const next = [...current]
        ;[next[from], next[to]] = [next[to], next[from]]
        return next
      })
      return null
    },
    putStep: async (programmeId, step, kind, title) => {
      if (!title.trim()) {
        return 'Give the step a name.'
      }
      if (step) {
        change(programmeId, (programme) => ({
          ...programme,
          steps: programme.steps.map((entry) => (entry.id === step.id ? { ...entry, title: title.trim() } : entry)),
        }))
      } else if (kind) {
        const created: ProgrammeStep = { id: nextId, programmeId, sortOrder: nextId, kind, title: title.trim() }
        setNextId(nextId + 1)
        change(programmeId, (programme) => ({ ...programme, steps: [...programme.steps, created] }))
      }
      return null
    },
    removeStep: async (programmeId, stepId) => {
      change(programmeId, (programme) => ({ ...programme, steps: programme.steps.filter((entry) => entry.id !== stepId) }))
      return null
    },
    moveStep: async (programmeId, stepId, direction) => {
      change(programmeId, (programme) => {
        const from = programme.steps.findIndex((entry) => entry.id === stepId)
        const to = from + direction
        if (from < 0 || to < 0 || to >= programme.steps.length) {
          return programme
        }
        const next = [...programme.steps]
        ;[next[from], next[to]] = [next[to], next[from]]
        return { ...programme, steps: next }
      })
      return null
    },
  }
}

export function ProgrammesDemo() {
  const state = useFakeProgrammes()
  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-4 text-2xl font-semibold text-slate-900">Programmes (made-up data)</h1>
        <ProgrammesView canEdit state={state} />
      </div>
    </div>
  )
}
