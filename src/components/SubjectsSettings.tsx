import { useState } from 'react'
import { Eye, EyeSlash, Plus } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import type { Subject } from '../lib/subjects'

type SubjectChanges = Partial<Pick<Subject, 'name' | 'sortOrder' | 'isActive'>>

// Class Settings > Subjects: what the school teaches. Classes and questions
// pick one, so a class is shown the questions that fit it.
export function SubjectsSettings({
  subjects,
  onSave,
}: {
  subjects: Subject[]
  // Adds (subject null) or changes one; resolves to an error message, or null.
  onSave: (subject: Subject | null, changes: SubjectChanges) => Promise<string | null>
}) {
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const sorted = [...subjects].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)

  async function run(subject: Subject | null, changes: SubjectChanges) {
    const failure = await onSave(subject, changes)
    setError(failure)
    return failure === null
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        What the school teaches (e.g. Coding, AI, Maths). Give each class its subject in My Classroom; each question picks
        a subject and the ages it suits.
      </p>
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {sorted.length === 0 && <p className="text-sm text-slate-500">No subjects yet.</p>}
      <ul className="space-y-2">
        {sorted.map((subject) => (
          <SubjectRow key={`${subject.id}-${subject.name}-${subject.isActive}`} subject={subject} onSave={(changes) => run(subject, changes)} />
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
        <input
          type="text"
          value={newName}
          maxLength={40}
          placeholder="New subject, e.g. Coding"
          aria-label="New subject name"
          onChange={(event) => setNewName(event.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={() => void run(null, { name: newName.trim() }).then((ok) => ok && setNewName(''))}
          aria-label="Add subject"
          className="inline-flex items-center gap-1 rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          Add
        </button>
      </div>
    </div>
  )
}

function SubjectRow({ subject, onSave }: { subject: Subject; onSave: (changes: SubjectChanges) => Promise<boolean> }) {
  const [name, setName] = useState(subject.name)
  const dirty = name.trim() !== subject.name

  return (
    <li className={cn('flex items-center gap-2', !subject.isActive && 'opacity-60')}>
      <input
        type="text"
        value={name}
        maxLength={40}
        aria-label={`${subject.name} name`}
        onChange={(event) => setName(event.target.value)}
        className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      {dirty && (
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => void onSave({ name: name.trim() })}
          className="rounded-xl bg-[#fc0c97] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
        >
          Save
        </button>
      )}
      <button
        type="button"
        onClick={() => void onSave({ isActive: !subject.isActive })}
        aria-label={subject.isActive ? `Hide ${subject.name}` : `Show ${subject.name}`}
        className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
      >
        {subject.isActive ? <Eye size={16} aria-hidden="true" /> : <EyeSlash size={16} aria-hidden="true" />}
      </button>
    </li>
  )
}
