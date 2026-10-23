import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { familyOf } from '../../lib/family'
import type { Person } from '../../lib/peopleApi'
import { FamilyCard } from './FamilyCard'
import { WhatsAppOpenProvider } from '../WhatsAppLink'

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

  describe('tags of the family', () => {
    const tag = (id: number, label: string) => ({ id, kind: 'tag' as const, label, isActive: true, legacyKey: null, color: '#dc2626' })
    const withTags = [
      person(1, { kind: 'parent', name: 'Yvonne', phone: '60164655564', contactId: 482, tagIds: [1] }),
      person(2, { kind: 'student', name: 'Teoh Tze Yu', parentId: 1, studentId: 56, tagIds: [2] }),
      person(3, { kind: 'student', name: 'Teoh Tze Yi', parentId: 1, studentId: 57 }),
    ]
    const renderCard = (onChange: (person: Person, tagIds: number[]) => Promise<void>, canEdit: boolean) =>
      render(
        <FamilyCard
          family={familyOf(482, withTags)!}
          childDetail={() => ({ age: null, label: null })}
          chatOf={() => null}
          onOpenChat={vi.fn()}
          tags={{ options: [tag(1, 'Crystal'), tag(2, 'Violet'), tag(3, 'Gold')], canEdit: () => canEdit, onChange, onCreate: vi.fn() }}
        />,
      )

    it('has one tag bar for the whole family, at the top, saved on the parent', async () => {
      // Still saving: the chosen tag already shows.
      const onChange = vi.fn((_person: Person, _ids: number[]) => new Promise<void>(() => undefined))
      renderCard(onChange, true)

      expect(screen.getAllByLabelText('Add a tag')).toHaveLength(1)
      const family = screen.getByRole('region', { name: 'Family' })
      const bar = screen.getByLabelText('Add a tag')
      const parentRow = screen.getByText('Yvonne')
      // The bar comes before the parent row, which comes before the children.
      expect(family.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_CONTAINED_BY).toBeTruthy()
      expect(bar.compareDocumentPosition(parentRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      await userEvent.selectOptions(bar, 'Gold')
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), [1, 3])
    })

    it('still shows the tags already on a child, as chips that cannot be changed here', () => {
      renderCard(async () => undefined, true)

      expect(screen.getByTitle('Crystal')).toBeInTheDocument()
      expect(screen.getByTitle('Violet')).toBeInTheDocument()
      expect(screen.queryByLabelText('Remove tag Violet')).not.toBeInTheDocument()
    })

    it('shows the family tags but no editor to an account that may not edit', () => {
      renderCard(async () => undefined, false)

      expect(screen.getByTitle('Crystal')).toBeInTheDocument()
      expect(screen.queryByLabelText('Add a tag')).not.toBeInTheDocument()
    })
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

describe('FamilyCard student codes', () => {
  const family = [
    person(1, { kind: 'parent', name: '60129219368', phone: '60129219368', contactId: 482 }),
    person(2, { kind: 'student', name: 'KEW KAYDEN', parentId: 1, studentId: 56 }),
    person(3, { kind: 'student', name: 'KEW KAYVEN', parentId: 1, studentId: 57 }),
    person(4, { kind: 'student', name: 'NO CODE', parentId: 1 }),
  ]
  const codes = new Map([
    [56, 'S1000056'],
    [57, 'S1000057'],
  ])

  it('puts the codes of the children in front of the parent and the own code in front of each child', () => {
    render(
      <FamilyCard
        family={familyOf(482, family)!}
        childDetail={() => ({ age: null, label: null })}
        chatOf={() => null}
        onOpenChat={vi.fn()}
        codeOf={(p) => (p.studentId !== null ? (codes.get(p.studentId) ?? null) : null)}
      />,
    )

    expect(screen.getByText("S1000056 / S1000057 · KEW KAYDEN & KEW KAYVEN & NO CODE's Parent")).toBeInTheDocument()
    expect(screen.getByText('S1000056 · KEW KAYDEN')).toBeInTheDocument()
    expect(screen.getByText('S1000057 · KEW KAYVEN')).toBeInTheDocument()
    expect(screen.getByText('NO CODE')).toBeInTheDocument()
  })
})

describe('FamilyCard child phone', () => {
  it("opens a child's chat by their own number when there is no chat yet, never for the parent's number", async () => {
    const withPhones = [
      person(1, { kind: 'parent', name: 'Mum', phone: '60164655564', contactId: 482, leadId: 174 }),
      person(2, { kind: 'student', name: 'Kid With Phone', parentId: 1, studentId: 56, phone: '016-555 0001' }),
      person(3, { kind: 'student', name: 'Kid On Mum Phone', parentId: 1, studentId: 57, phone: '60164655564' }),
    ]
    const openChat = vi.fn()
    render(
      <WhatsAppOpenProvider value={openChat}>
        <FamilyCard
          family={{ ...familyOf(482, withPhones)!, leadId: 174 }}
          childDetail={() => ({ age: null, label: null })}
          chatOf={() => null}
          onOpenChat={vi.fn()}
        />
      </WhatsAppOpenProvider>,
    )

    const buttons = screen.getAllByRole('button', { name: 'Open chat' })
    expect(buttons).toHaveLength(1)
    await userEvent.click(buttons[0])
    expect(openChat).toHaveBeenCalledWith({ phone: '60165550001', name: 'Kid With Phone', leadId: null, ownNumberOnly: true })
  })
})
