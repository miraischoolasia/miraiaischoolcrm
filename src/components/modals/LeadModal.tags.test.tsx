import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadModal } from './LeadModal'
import type { Lead, LeadFormState, LeadOption } from '../../types/domain'
import type { LeadChannel } from '../../lib/leadChannels'
import { WhatsAppOpenProvider } from '../WhatsAppLink'

const tag = (id: number, label: string): LeadOption => ({
  id,
  kind: 'tag',
  label,
  isActive: true,
  legacyKey: null,
  color: '#3b82f6',
})

const formState: LeadFormState = {
  fullName: 'Mrs Lim',
  phone: '60123456789',
  sourceId: '',
  picId: '',
  state: '',
  tagIds: [1],
  status: 'new',
  children: [{ name: 'Ken', age: '9', phone: '' }],
  notes: '',
  addedDate: '2026-10-01',
}

function renderModal(props: Partial<React.ComponentProps<typeof LeadModal>> = {}) {
  const onFieldChange = vi.fn()
  const onAddLeadOption = vi.fn()
  render(
    <LeadModal
      editingLead={null}
      formState={formState}
      saveError={null}
      isSaving={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      onFieldChange={onFieldChange}
      leadOptions={[tag(1, 'Hot'), tag(2, 'VIP')]}
      onAddLeadOption={onAddLeadOption}
      {...props}
    />,
  )
  return { onFieldChange, onAddLeadOption }
}

describe('LeadModal tags', () => {
  it('shows the lead tags under the children', () => {
    renderModal()

    const children = screen.getByText('Children').closest('div[class*="rounded-2xl"]') as HTMLElement
    const tags = within(children).getByText('Tags')
    expect(within(children).getByText('Hot')).toBeInTheDocument()
    // Below the child rows, in the same box.
    const lastChild = within(children).getByDisplayValue('Ken')
    expect(lastChild.compareDocumentPosition(tags) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds a tag that exists to the lead', async () => {
    const { onFieldChange } = renderModal()

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), 'VIP')

    expect(onFieldChange).toHaveBeenCalledWith('tagIds', [1, 2])
  })

  it('takes a tag off the lead', async () => {
    const { onFieldChange } = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Remove tag Hot' }))

    expect(onFieldChange).toHaveBeenCalledWith('tagIds', [])
  })

  it('creates a new tag with its colour whenever it is needed and puts it on the lead', async () => {
    const onAddLeadOption = vi.fn().mockResolvedValue(tag(9, 'Walk-in event'))
    const { onFieldChange } = renderModal({ onAddLeadOption })

    await userEvent.selectOptions(screen.getByLabelText('Add a tag'), '+ Create new tag...')
    await userEvent.type(screen.getByLabelText('New tag name'), 'Walk-in event{Enter}')

    expect(onAddLeadOption).toHaveBeenCalledWith('tag', 'Walk-in event', expect.stringMatching(/^#[0-9a-f]{6}$/))
    expect(onFieldChange).toHaveBeenCalledWith('tagIds', [1, 9])
  })

  it('cannot be changed in the view-only profile', () => {
    renderModal({ readOnly: true })

    expect(screen.getByLabelText('Add a tag')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove tag Hot' })).toBeDisabled()
  })
})

describe('LeadModal hidden WhatsApp number', () => {
  const lead = {
    id: 134,
    fullName: '236998554123456',
    phone: null,
    sourceId: null,
    picId: null,
    state: null,
    tagIds: [],
    checks: {},
    status: 'new',
    children: [],
    notes: null,
    followUps: [],
    tasks: [],
    convertedStudentId: null,
    addedDate: '2026-10-20',
    createdAt: '',
    updatedAt: '',
  } as Lead
  const chat: LeadChannel = {
    id: 1,
    leadId: 134,
    channel: 'whatsapp',
    contactId: 21,
    inboxId: 1,
    inboxName: null,
    conversationId: 201,
    name: '236998554123456',
    pageName: null,
    firstSeenAt: '2026-10-20T00:00:00Z',
  }

  it('opens the chat of the lead from the details and closes the window', async () => {
    const openChat = vi.fn()
    const onClose = vi.fn()
    const { unmount } = render(
      <WhatsAppOpenProvider value={openChat}>
        <LeadModal
          editingLead={lead}
          formState={{ ...formState, fullName: '236998554123456', phone: '' }}
          saveError={null}
          isSaving={false}
          onClose={onClose}
          onSubmit={vi.fn()}
          onFieldChange={vi.fn()}
          leadOptions={[]}
          onAddLeadOption={vi.fn()}
          chats={[chat]}
        />
      </WhatsAppOpenProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /Open the WhatsApp chat/ }))

    expect(openChat).toHaveBeenCalledWith(expect.objectContaining({ leadId: 134, chat: { conversationId: 201, contactId: 21 } }))
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
  })
})

describe('LeadModal optional fields', () => {
  it('shows the Chinese name and the second phone, and passes what is typed on', async () => {
    const { onFieldChange } = renderModal({ formState: { ...formState, nameZh: '小明', secondParentPhone: '' } })

    expect(screen.getByLabelText(/Chinese name/)).toHaveValue('小明')
    await userEvent.type(screen.getByLabelText(/Another parent's phone/), '7')

    expect(onFieldChange).toHaveBeenCalledWith('secondParentPhone', '7')
  })
})
