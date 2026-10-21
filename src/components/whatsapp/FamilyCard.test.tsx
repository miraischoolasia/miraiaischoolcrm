import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { familyOf } from '../../lib/family'
import type { Person } from '../../lib/peopleApi'
import { FamilyCard } from './FamilyCard'

const person = (id: number, patch: Partial<Person>): Person => ({
  id,
  kind: 'contact',
  name: null,
  phone: null,
  email: null,
  contactId: null,
  parentId: null,
  leadId: null,
  studentId: null,
  ...patch,
})

const people = [
  person(1, { kind: 'parent', name: '@yvonne.ywbl', phone: '60164655564', contactId: 482, leadId: 174 }),
  person(2, { kind: 'student', name: 'Teoh Tze Yu', parentId: 1, studentId: 56 }),
  person(3, { kind: 'student', name: 'Ethan Lim', parentId: 1, contactId: 600 }),
  person(4, { kind: 'parent', name: 'Yvonne', contactId: 398, leadId: 174 }),
]

function setup(contactId: number, extra: Partial<React.ComponentProps<typeof FamilyCard>> = {}) {
  const family = familyOf(contactId, people)!
  const props = {
    family,
    childDetail: (child: Person) => (child.id === 2 ? { age: 11, label: 'HOA' } : { age: null, label: null }),
    chatOf: (id: number) => (id === 600 ? 77 : id === 398 ? 88 : id === 482 ? 55 : null),
    onOpenChat: vi.fn(),
    onOpenStudent: vi.fn(),
    ...extra,
  }
  render(<FamilyCard {...props} />)
  return props
}

describe('FamilyCard', () => {
  it('shows the parent, marks the open chat, and lists the children with what is known of them', () => {
    setup(482)

    expect(screen.getByText('@yvonne.ywbl')).toBeInTheDocument()
    expect(screen.getByText('Parent · +60164655564')).toBeInTheDocument()
    expect(screen.getByText('This chat')).toBeInTheDocument()
    expect(screen.getByText('Teoh Tze Yu')).toBeInTheDocument()
    expect(screen.getByText('11 years · HOA')).toBeInTheDocument()
    expect(screen.getByText('Ethan Lim')).toBeInTheDocument()
  })

  it('opens the student, and the chat of a child who writes themself', async () => {
    const props = setup(482)

    await userEvent.click(screen.getByRole('button', { name: 'Student Progress' }))
    expect(props.onOpenStudent).toHaveBeenCalledWith(56)

    const buttons = screen.getAllByRole('button', { name: 'Open chat' })
    await userEvent.click(buttons[buttons.length - 1])
    expect(props.onOpenChat).toHaveBeenCalledWith(77)
  })

  it('points to the same parent\'s other chat', async () => {
    const props = setup(482)

    expect(screen.getByText(/The same parent has another chat/)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Open chat' })[0])
    expect(props.onOpenChat).toHaveBeenCalledWith(88)
  })

  it('marks the student themself and offers the way to the parent', async () => {
    const props = setup(600)

    expect(screen.getByText('This chat')).toBeInTheDocument()
    expect(screen.getAllByText('Ethan Lim')).toHaveLength(1)
    // The parent's chat and the parent's other chat.
    await userEvent.click(screen.getAllByRole('button', { name: 'Open chat' })[0])
    expect(props.onOpenChat).toHaveBeenCalledWith(55)
  })

  it('says when a student has no parent saved yet', () => {
    const lonely = [person(9, { kind: 'student', name: 'Alone', contactId: 700 })]
    render(
      <FamilyCard
        family={familyOf(700, lonely)!}
        childDetail={() => ({ age: null, label: null })}
        chatOf={() => null}
        onOpenChat={vi.fn()}
      />,
    )

    expect(screen.getByText('Parent not saved yet')).toBeInTheDocument()
  })

  it('shows a child who did the HOA and then joined a class as one child, one button, the class record', async () => {
    const twice = [
      person(1, { kind: 'parent', name: 'Mum', phone: '60195593237', contactId: 10, leadId: 5 }),
      person(2, { kind: 'student', name: 'NG ZE YI', parentId: 1, studentId: 32 }),
      person(3, { kind: 'student', name: 'NG ZE YI', parentId: 1, studentId: 37 }),
    ]
    const onOpenStudent = vi.fn()
    render(
      <FamilyCard
        family={familyOf(10, twice)!}
        childDetail={(child) =>
          child.studentId === 32
            ? { age: 6, label: 'HOA', kind: 'hoa' }
            : { age: 6, label: 'Regular · 3 Months', kind: 'regular' }
        }
        chatOf={() => null}
        onOpenChat={vi.fn()}
        onOpenStudent={onOpenStudent}
      />,
    )

    expect(screen.getAllByText('NG ZE YI')).toHaveLength(1)
    expect(screen.getByText('6 years · Regular · 3 Months · did the HOA first')).toBeInTheDocument()
    // One button, and it opens the class record, where the child is now.
    await userEvent.click(screen.getByRole('button', { name: 'Student Progress' }))
    expect(onOpenStudent).toHaveBeenCalledTimes(1)
    expect(onOpenStudent).toHaveBeenCalledWith(37)
  })

  it('has no add button: children are added in the lead form below', () => {
    setup(482)

    expect(screen.queryByRole('button', { name: /Add a child/ })).not.toBeInTheDocument()
  })

  it('shows the tags of the parent and a child, and saves a tag put on a child', async () => {
    const tag = (id: number, label: string) => ({ id, kind: 'tag' as const, label, isActive: true, legacyKey: null, color: '#dc2626' })
    const withTags = [
      person(1, { kind: 'parent', name: 'Yvonne', phone: '60164655564', contactId: 482, tagIds: [1] }),
      person(2, { kind: 'student', name: 'Teoh Tze Yu', parentId: 1, studentId: 56 }),
    ]
    const family = familyOf(482, withTags)!
    // Still saving: the chosen tag already shows.
    const onChange = vi.fn(() => new Promise<void>(() => undefined))
    render(
      <FamilyCard
        family={family}
        childDetail={() => ({ age: null, label: null })}
        chatOf={() => null}
        onOpenChat={vi.fn()}
        tags={{
          options: [tag(1, 'Crystal'), tag(2, 'Violet')],
          canEdit: (p) => p.studentId !== null,
          onChange,
          onCreate: vi.fn(),
        }}
      />,
    )

    // The parent's tag is only shown (the account may not change a parent); the child's tags can be changed.
    expect(screen.getByTitle('Crystal')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Add a tag')).toHaveLength(1)
    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), 'Violet')
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), [2])
    expect(screen.getByTitle('Violet')).toBeInTheDocument()
  })
})

describe('FamilyCard parent name', () => {
  it('calls a parent with no name, or only a number, by the children', () => {
    const nameless = [
      person(1, { kind: 'parent', name: '60129219368', phone: '60129219368', contactId: 482 }),
      person(2, { kind: 'student', name: 'KEW KAYDEN', parentId: 1 }),
      person(3, { kind: 'student', name: 'KEW KAYVEN', parentId: 1 }),
    ]
    render(
      <FamilyCard
        family={familyOf(482, nameless)!}
        childDetail={() => ({ age: null, label: null })}
        chatOf={() => null}
        onOpenChat={vi.fn()}
        onOpenStudent={vi.fn()}
      />,
    )

    expect(screen.getByText("KEW KAYDEN & KEW KAYVEN's Parent")).toBeInTheDocument()
    expect(screen.getByText('Parent · +60129219368')).toBeInTheDocument()
  })
})
