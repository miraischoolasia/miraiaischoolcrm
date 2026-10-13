import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { newFlowDraft, type AutomationFlow } from '../../lib/automationFlows'
import type { Classroom, LeadOption } from '../../types/domain'
import { AutomationsSection } from './AutomationsSection'

// The canvas needs a real browser layout; here it is replaced by a few buttons that do what a click
// on the canvas does.
vi.mock('../automations/FlowCanvas', () => ({
  FlowCanvas: ({
    graph,
    triggerLabel,
    onSelect,
    onAddAfter,
  }: {
    graph: { nodes: { id: string }[] }
    triggerLabel: string
    onSelect: (id: string | null) => void
    onAddAfter: (
      from: string,
      port: 'out' | 'yes' | 'no',
      kind: 'message' | 'age' | 'classroom' | 'hours' | 'stage' | 'source' | 'tag' | 'pic' | 'form',
    ) => void
  }) => (
    <div data-testid="canvas">
      {triggerLabel} · {graph.nodes.length} blocks
      <button type="button" onClick={() => onSelect('trigger')}>
        canvas trigger
      </button>
      <button type="button" onClick={() => onSelect(null)}>
        canvas empty space
      </button>
      <button type="button" onClick={() => onAddAfter('trigger', 'out', 'age')}>
        canvas add age after trigger
      </button>
      <button type="button" onClick={() => onAddAfter('trigger', 'out', 'hours')}>
        canvas add hours after trigger
      </button>
      <button type="button" onClick={() => onAddAfter('trigger', 'out', 'stage')}>
        canvas add stage after trigger
      </button>
      <button type="button" onClick={() => onAddAfter('trigger', 'out', 'source')}>
        canvas add source after trigger
      </button>
      <button type="button" onClick={() => onAddAfter('trigger', 'out', 'form')}>
        canvas add form after trigger
      </button>
      <button type="button" onClick={() => onAddAfter('m1', 'out', 'message')}>
        canvas add message after m1
      </button>
      {graph.nodes.map((node) => (
        <button key={node.id} type="button" onClick={() => onSelect(node.id)}>
          canvas block {node.id}
        </button>
      ))}
    </div>
  ),
}))

const hook = vi.hoisted(() => ({
  state: {
    flows: [] as unknown[],
    isLoading: false,
    error: null as string | null,
    reload: vi.fn(),
    save: vi.fn(),
    toggle: vi.fn(),
    remove: vi.fn(),
    runNow: vi.fn(),
    sendTest: vi.fn(),
  },
}))
vi.mock('../../hooks/useAutomationFlows', () => ({ useAutomationFlows: () => hook.state }))

const contactHook = vi.hoisted(() => ({
  state: {
    contacts: [] as unknown[],
    error: null as string | null,
    reload: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}))
vi.mock('../../hooks/useAutomationContacts', () => ({ useAutomationContacts: () => contactHook.state }))

const extras = vi.hoisted(() => ({
  autoSend: {
    paused: false,
    dailyCap: 40,
    gapSeconds: 30,
    fromHour: 9,
    untilHour: 21,
    senderSeenAt: null as string | null,
  },
  saveAutoSend: vi.fn(),
  stats: new Map<number, unknown>(),
  forms: [] as { id: string; name: string }[],
  optouts: [] as { phone: string; reason: string | null; createdAt: string }[],
  optoutError: null as string | null,
  allowAgain: vi.fn(),
}))
vi.mock('../../hooks/useAutomationExtras', () => ({
  useAutomationStats: () => ({ stats: extras.stats, reload: vi.fn() }),
  useAutomationForms: () => extras.forms,
  useAutoSend: () => ({ settings: extras.autoSend, error: null, save: extras.saveAutoSend, reload: vi.fn() }),
  useAutomationOptouts: () => ({
    optouts: extras.optouts,
    error: extras.optoutError,
    reload: vi.fn(),
    allowAgain: extras.allowAgain,
  }),
}))

const chatHook = vi.hoisted(() => ({
  state: {
    info: null as { key: string; lastReceivedAt: Date | null; chats: number } | null,
    error: null as string | null,
    isLoading: false,
    reload: vi.fn(),
  },
}))
vi.mock('../../hooks/useChatWebhook', () => ({ useChatWebhook: () => chatHook.state }))

const rulesHook = vi.hoisted(() => ({
  rules: [
    { id: 12, phrase: 'free trial coding', sourceId: 3, tagIds: [], isActive: true },
    { id: 13, phrase: 'old advert', sourceId: 3, tagIds: [], isActive: false },
  ],
}))
vi.mock('../../hooks/useSourceRules', () => ({ useSourceRules: () => ({ rules: rulesHook.rules, isLoading: false, error: null }) }))

const flow = (change: Partial<AutomationFlow> = {}): AutomationFlow => {
  const base = newFlowDraft()
  return {
    id: 1,
    name: 'Class reminder',
    trigger: 'class_start',
    enabled: false,
    graph: base.graph,
    lastRunAt: null,
    lastError: null,
    ...change,
  }
}

const room: Classroom = {
  id: 1,
  name: 'Coder A',
  category: 'regular',
  ageGroup: '9-11 Years Old',
  programLevel: 'Coder Foundation',
  teacherId: null,
  status: 'active',
  notes: null,
  archivedAt: null,
}

const leadOptions = [
  { id: 3, kind: 'source', label: 'Facebook Ads', isActive: true, legacyKey: null, color: null },
  { id: 4, kind: 'source', label: 'Old source', isActive: false, legacyKey: null, color: null },
  { id: 7, kind: 'tag', label: 'Hot', isActive: true, legacyKey: null, color: null },
  { id: 9, kind: 'pic', label: 'Lex', isActive: true, legacyKey: null, color: null },
] as LeadOption[]

function setup(canEdit = true) {
  render(<AutomationsSection classrooms={[room]} canEdit={canEdit} leadOptions={leadOptions} />)
}

// The editor opens in the simple list; most of these tests are about the canvas, so they switch to it.
async function openFirst() {
  await userEvent.click(screen.getByRole('button', { name: /Class reminder A regular class starts/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
}

// A new flow starts on the recipe list; this takes the blank one and shows the canvas.
async function newBlankFlow() {
  await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
  await userEvent.click(screen.getByRole('button', { name: 'Start with a blank flow' }))
  await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
}

describe('AutomationsSection', () => {
  beforeEach(() => {
    hook.state.flows = [flow(), flow({ id: 2, name: 'Zoom reminder', trigger: 'zoom_start', enabled: true })]
    hook.state.isLoading = false
    hook.state.error = null
    hook.state.save.mockReset().mockResolvedValue({ error: null, flow: flow() })
    hook.state.toggle.mockReset().mockResolvedValue(null)
    hook.state.remove.mockReset().mockResolvedValue(null)
    hook.state.runNow.mockReset().mockResolvedValue({ queued: 2, error: null })
    hook.state.sendTest.mockReset().mockResolvedValue({ queued: 1, error: null })
    window.localStorage.removeItem('mirai.flowTestPhone')
    contactHook.state.contacts = [{ id: 4, name: 'Lex', phone: '60123456789' }]
    contactHook.state.error = null
    contactHook.state.add.mockReset().mockResolvedValue(null)
    contactHook.state.update.mockReset().mockResolvedValue(null)
    contactHook.state.remove.mockReset().mockResolvedValue(null)
    chatHook.state.info = { key: 'abcdef0123456789abcdef', lastReceivedAt: null, chats: 0 }
    chatHook.state.error = null
    chatHook.state.isLoading = false
    chatHook.state.reload.mockReset()
    extras.stats = new Map()
    extras.autoSend = { paused: false, dailyCap: 40, gapSeconds: 30, fromHour: 9, untilHour: 21, senderSeenAt: null }
    extras.saveAutoSend.mockReset().mockResolvedValue(null)
    extras.forms = []
    extras.optouts = []
    extras.optoutError = null
    extras.allowAgain.mockReset().mockResolvedValue(null)
  })

  it('lists the flows first, with whether each is live', () => {
    setup()
    expect(screen.getByText('Class reminder')).toBeInTheDocument()
    expect(screen.getByText('Zoom reminder')).toBeInTheDocument()
    expect(screen.getByText('A regular class starts · 1 message')).toBeInTheDocument()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
  })

  it('opens a flow as the canvas alone, with no panel until a card is clicked', async () => {
    setup()
    await openFirst()
    expect(screen.getByTestId('canvas')).toHaveTextContent('A regular class starts · 1 blocks')
    expect(screen.getByLabelText('Flow name')).toHaveValue('Class reminder')
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Message')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('When')).not.toBeInTheDocument()
  })

  it('opens the settings of a block in the left panel when its card is clicked, and closes them', async () => {
    setup()
    await openFirst()
    await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
    expect(screen.getByRole('complementary')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue(
      'Hi {child}, a reminder that you have class today at {time}. Please be on time.',
    )
    expect(screen.getByLabelText('How long before')).toHaveValue(1)

    await userEvent.click(screen.getByRole('button', { name: /Close/ }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
    expect(screen.getByLabelText('Message')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'canvas empty space' }))
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })

  it('opens the trigger settings when the first card is clicked', async () => {
    setup()
    await openFirst()
    await userEvent.click(screen.getByRole('button', { name: 'canvas trigger' }))
    expect(screen.getByLabelText('When')).toHaveValue('class_start')
    await userEvent.selectOptions(screen.getByLabelText('When'), 'zoom_start')
    expect(screen.getByTestId('canvas')).toHaveTextContent('A Zoom meeting starts')
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })

  it('changes a block from the left panel and saves it', async () => {
    setup()
    await openFirst()
    await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
    fireEvent.change(screen.getByLabelText('How long before'), { target: { value: '2' } })
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
    await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
    const saved = hook.state.save.mock.calls[0][0]
    expect(saved.graph.nodes[0]).toMatchObject({ id: 'm1', mins: 120 })
  })

  it('lets the unit be changed freely and clearing the number leaves no 0 behind', async () => {
    setup()
    await openFirst()
    await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
    const amount = screen.getByLabelText('How long before')
    const unit = screen.getByLabelText('Unit')

    await userEvent.selectOptions(unit, 'minutes')
    await userEvent.clear(amount)
    expect(amount).toHaveValue(null)
    await userEvent.type(amount, '3')
    expect(amount).toHaveValue(3)

    // Hours and days can still be picked afterwards.
    await userEvent.selectOptions(unit, 'hours')
    expect(unit).toHaveValue('hours')
    await userEvent.selectOptions(unit, 'days')
    expect(unit).toHaveValue('days')
    await userEvent.selectOptions(unit, 'minutes')
    expect(unit).toHaveValue('minutes')
    expect(amount).toHaveValue(3)

    await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
    await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
    expect(hook.state.save.mock.calls[0][0].graph.nodes[0]).toMatchObject({ id: 'm1', mins: 3 })
  })

  it('puts an emptied number back to what the block has when the box is left', async () => {
    setup()
    await openFirst()
    await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
    const amount = screen.getByLabelText('How long before')
    await userEvent.clear(amount)
    await userEvent.tab()
    expect(amount).toHaveValue(1)
    expect(screen.getByLabelText('Unit')).toHaveValue('hours')
  })

  it('sends a test of the saved flow to the number typed, with the age and class tried above', async () => {
    setup()
    await openFirst()
    await userEvent.type(screen.getByLabelText('Test age'), '9')
    await userEvent.selectOptions(screen.getByLabelText('Test class'), '1')
    await userEvent.type(screen.getByLabelText('My phone number'), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }))
    await waitFor(() => expect(hook.state.sendTest).toHaveBeenCalledTimes(1))
    expect(hook.state.sendTest).toHaveBeenCalledWith(
      1,
      '60123456789',
      expect.objectContaining({ age: 9, classroomId: 1, hours: null, stage: null }),
    )
    expect(await screen.findByText(/1 test message added\. .* to \+60123456789\./)).toBeInTheDocument()
    // The number is remembered for next time.
    expect(window.localStorage.getItem('mirai.flowTestPhone')).toBe('012-345 6789')
  })

  it('asks for a number it can use before sending a test', async () => {
    setup()
    await openFirst()
    await userEvent.type(screen.getByLabelText('My phone number'), '123')
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }))
    expect(await screen.findByText(/Type your own WhatsApp number/)).toBeInTheDocument()
    expect(hook.state.sendTest).not.toHaveBeenCalled()
  })

  it('shows why a test could not be sent', async () => {
    hook.state.sendTest.mockResolvedValue({ queued: 0, error: 'There are already 20 test messages waiting.' })
    setup()
    await openFirst()
    await userEvent.type(screen.getByLabelText('My phone number'), '0123456789')
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }))
    expect(await screen.findByText('There are already 20 test messages waiting.')).toBeInTheDocument()
  })

  it('says when the pretend child gets nothing', async () => {
    hook.state.sendTest.mockResolvedValue({ queued: 0, error: null })
    setup()
    await openFirst()
    await userEvent.type(screen.getByLabelText('My phone number'), '0123456789')
    await userEvent.click(screen.getByRole('button', { name: /Send test/ }))
    expect(await screen.findByText(/would get no message, so nothing was added/)).toBeInTheDocument()
  })

  it('does not send a test while the flow has changes that are not saved', async () => {
    setup()
    await openFirst()
    await userEvent.type(screen.getByLabelText('Flow name'), ' edited')
    expect(screen.getByRole('button', { name: /Send test/ })).toBeDisabled()
    expect(screen.getByText(/Save the flow first/)).toBeInTheDocument()
  })

  it('offers the test only to an admin', async () => {
    setup(false)
    await openFirst()
    expect(screen.queryByLabelText('My phone number')).not.toBeInTheDocument()
  })

  it('switches a flow on from the list and says what happens next', async () => {
    setup()
    fireEvent.click(screen.getByRole('switch', { name: 'Class reminder on or off' }))
    await waitFor(() => expect(hook.state.toggle).toHaveBeenCalledWith(1, true))
    expect(await screen.findByText(/"Class reminder" is on\./)).toBeInTheDocument()
  })

  it('runs the flows now and says how many messages were added', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Run now' }))
    expect(await screen.findByText('2 messages added to the approval queue in WhatsApp.')).toBeInTheDocument()
  })

  it('shows a flow that failed the last time it ran', async () => {
    hook.state.flows = [flow({ lastError: 'invalid input syntax for type integer' })]
    setup()
    expect(screen.getByText('Has a problem')).toBeInTheDocument()
    await openFirst()
    expect(screen.getByRole('alert')).toHaveTextContent('invalid input syntax for type integer')
  })

  it('asks for a name before a new flow is saved', async () => {
    hook.state.save.mockResolvedValue({ error: 'Give the flow a name.', flow: null })
    setup()
    await newBlankFlow()
    await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
    expect(await screen.findByText('Give the flow a name.')).toBeInTheDocument()
  })

  it('saves what was typed for a new flow', async () => {
    setup()
    await newBlankFlow()
    await userEvent.type(screen.getByLabelText('Flow name'), 'Trial reminder')
    await userEvent.click(screen.getByRole('button', { name: 'canvas trigger' }))
    await userEvent.selectOptions(screen.getByLabelText('When'), 'trial_start')
    await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
    await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
    expect(hook.state.save.mock.calls[0][0]).toMatchObject({ id: null, name: 'Trial reminder', trigger: 'trial_start' })
  })

  it('adds the next step with the "+" after a card and opens it in the panel', async () => {
    setup()
    await openFirst()
    await userEvent.click(screen.getByRole('button', { name: 'canvas add age after trigger' }))
    expect(screen.getByLabelText('Lowest age')).toBeInTheDocument()
    expect(screen.getByTestId('canvas')).toHaveTextContent('2 blocks')

    await userEvent.click(screen.getByRole('button', { name: 'canvas add message after m1' }))
    expect(screen.getByLabelText('Message')).toBeInTheDocument()
    expect(screen.getByTestId('canvas')).toHaveTextContent('3 blocks')
    await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
    await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
    const { edges } = hook.state.save.mock.calls[0][0].graph
    expect(edges).toContainEqual({ from: 'trigger', port: 'out', to: 'c1' })
    expect(edges).toContainEqual({ from: 'm1', port: 'out', to: 'm2' })
  })

  it('is read only for someone who is not an admin', async () => {
    setup(false)
    expect(screen.getByRole('switch', { name: 'Class reminder on or off' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'New flow' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run now' })).not.toBeInTheDocument()
    await openFirst()
    expect(screen.getByText(/Only an admin can change it/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save flow' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Flow name')).toBeDisabled()

    // Looking is allowed: the card opens, but nothing in it can be changed and nothing is added.
    await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
    expect(screen.getByLabelText('Message')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Delete block' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'canvas add message after m1' }))
    expect(screen.getByTestId('canvas')).toHaveTextContent('1 blocks')
  })

  it('tests a child against the flow', async () => {
    setup()
    await openFirst()
    expect(screen.queryByText(/This child would get/)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Test age'), '9')
    expect(
      await screen.findByText('Hi Ethan, a reminder that you have class today at 8:30 pm. Please be on time.'),
    ).toBeInTheDocument()
  })

  it('goes back to the list, asking first when there are unsaved changes', async () => {
    setup()
    await openFirst()
    await userEvent.type(screen.getByLabelText('Flow name'), ' edited')
    await userEvent.click(screen.getByRole('button', { name: /Automations/ }))
    expect(await screen.findByText(/changes you have not saved/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(await screen.findByText('Zoom reminder')).toBeInTheDocument()
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
  })

  describe('filters, settings and results', () => {
    it('adds a source block that offers the sources (not hidden ones) and keeps the ticked ones', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas add source after trigger' }))
      expect(screen.getByRole('checkbox', { name: 'Facebook Ads' })).not.toBeChecked()
      expect(screen.queryByRole('checkbox', { name: 'Old source' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('checkbox', { name: 'Facebook Ads' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      const nodes = hook.state.save.mock.calls[0][0].graph.nodes
      expect(nodes).toContainEqual(expect.objectContaining({ kind: 'source', ids: ['3'] }))
    })

    it('offers the forms by name', async () => {
      extras.forms = [{ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Summer camp form' }]
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas add form after trigger' }))
      expect(screen.getByRole('checkbox', { name: 'Summer camp form' })).toBeInTheDocument()
    })

    it('stops a flow for chosen stages and for the same person within some days', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas trigger' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Converted' }))
      await userEvent.click(screen.getByRole('checkbox', { name: 'Lost' }))
      fireEvent.change(screen.getByLabelText('Days before the same person is messaged again'), {
        target: { value: '30' },
      })
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      expect(hook.state.save.mock.calls[0][0].graph.settings).toEqual({
        stopStages: ['converted', 'lost'],
        cooldownDays: 30,
      })
    })

    it('leaves the settings out of a flow that never used them', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
      fireEvent.change(screen.getByLabelText('How long before'), { target: { value: '2' } })
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      expect('settings' in hook.state.save.mock.calls[0][0].graph).toBe(false)
    })

    it('shows what a flow has done under its name', () => {
      extras.stats = new Map([
        [1, { flowId: 1, queued: 12, sent: 9, pending: 1, skipped: 2, expired: 0, failed: 0, replied: 3 }],
      ])
      setup()
      expect(screen.getByText('9 sent · 3 replied (33%) · 1 waiting · 2 skipped')).toBeInTheDocument()
    })

    it('lists the numbers that wrote STOP and allows one again after asking', async () => {
      extras.optouts = [{ phone: '60122552285', reason: 'The parent wrote STOP', createdAt: '2026-10-13T05:00:00Z' }]
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Asked to stop/ }))
      expect(screen.getByText('+60 12-255 2285')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Allow +60 12-255 2285 again' }))
      await userEvent.click(await screen.findByRole('button', { name: 'Allow again' }))
      await waitFor(() => expect(extras.allowAgain).toHaveBeenCalledWith('60122552285'))
    })
  })

  describe('parent replies', () => {
    it('says it is not connected until a message has arrived, and shows the address to paste', async () => {
      setup()
      expect(screen.getByRole('button', { name: /Parent replies/ })).toHaveTextContent('Not connected yet')
      await userEvent.click(screen.getByRole('button', { name: /Parent replies/ }))
      expect((screen.getByLabelText('Webhook address') as HTMLInputElement).value).toContain(
        '/functions/v1/chat-activity?key=abcdef0123456789abcdef',
      )
      expect(screen.getByText(/No message has arrived yet/)).toBeInTheDocument()
    })

    it('shows when the last message arrived and checks again on request', async () => {
      chatHook.state.info = { key: 'abcdef0123456789abcdef', lastReceivedAt: new Date(Date.now() - 5 * 60000), chats: 12 }
      setup()
      expect(screen.getByRole('button', { name: /Parent replies/ })).toHaveTextContent('Last message 5 minutes ago')
      await userEvent.click(screen.getByRole('button', { name: /Parent replies/ }))
      expect(screen.getByText(/Connected: 12 chats known/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
      expect(chatHook.state.reload).toHaveBeenCalledTimes(1)
    })

    it('shows why the address could not be loaded', async () => {
      chatHook.state.info = null
      chatHook.state.error = 'Parent replies are not set up in the database yet.'
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Parent replies/ }))
      expect(screen.getByRole('alert')).toHaveTextContent('not set up in the database yet')
    })

    it('is hidden from someone who is not an admin', () => {
      setup(false)
      expect(screen.queryByRole('button', { name: /Parent replies/ })).not.toBeInTheDocument()
    })
  })

  describe('new triggers', () => {
    it('lets a message go after the event and saves it', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
      expect(screen.getByLabelText('Before or after')).toHaveValue('before')
      await userEvent.selectOptions(screen.getByLabelText('Before or after'), 'after')
      expect(screen.getByLabelText('How long after')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      expect(hook.state.save.mock.calls[0][0].graph.nodes[0]).toMatchObject({ id: 'm1', after: true })
    })

    it('sets every message to go after when the trigger is a new lead', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas trigger' }))
      await userEvent.selectOptions(screen.getByLabelText('When'), 'lead_created')
      await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
      expect(screen.getByText('after it happens')).toBeInTheDocument()
      expect(screen.queryByLabelText('Before or after')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      const saved = hook.state.save.mock.calls[0][0]
      expect(saved.trigger).toBe('lead_created')
      expect(saved.graph.nodes[0]).toMatchObject({ id: 'm1', after: true })
    })

    it('adds a lessons-left block and changes the hours', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas add hours after trigger' }))
      const hours = screen.getByLabelText('Hours left')
      expect(hours).toHaveValue(2)
      fireEvent.change(hours, { target: { value: '4' } })
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      const nodes = hook.state.save.mock.calls[0][0].graph.nodes
      expect(nodes).toContainEqual(expect.objectContaining({ kind: 'hours', max: 4 }))
    })

    it('adds a lead-stage block and ticks stages', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas add stage after trigger' }))
      expect(screen.getByRole('checkbox', { name: 'New' })).toBeChecked()
      await userEvent.click(screen.getByRole('checkbox', { name: 'Contacted' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      const nodes = hook.state.save.mock.calls[0][0].graph.nodes
      expect(nodes).toContainEqual(expect.objectContaining({ kind: 'stage', stages: ['new', 'contacted'] }))
    })

    it('tests a lessons-left question with the lessons-left box', async () => {
      hook.state.flows = [
        flow({
          graph: {
            trigger: { x: 0, y: 0 },
            nodes: [
              { id: 'h1', type: 'condition', kind: 'hours', x: 0, y: 0, max: 2 },
              { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'Only {child} is low', contactId: 4 },
            ],
            edges: [
              { from: 'trigger', port: 'out', to: 'h1' },
              { from: 'h1', port: 'yes', to: 'm1' },
            ],
          },
        }),
      ]
      setup()
      await openFirst()
      await userEvent.type(screen.getByLabelText('Test lessons left'), '1')
      expect(await screen.findByText('Only Ethan is low')).toBeInTheDocument()
      await userEvent.clear(screen.getByLabelText('Test lessons left'))
      await userEvent.type(screen.getByLabelText('Test lessons left'), '5')
      expect(await screen.findByText('This child would get no message.')).toBeInTheDocument()
    })
  })

  describe('contacts', () => {
    it('lists the contacts, and adds one with a name and a number', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Contacts/ }))
      expect(screen.getByText('Lex')).toBeInTheDocument()
      expect(screen.getByText('+60 12-345 6789')).toBeInTheDocument()

      await userEvent.type(screen.getByLabelText('Contact name'), 'Teacher Mei')
      await userEvent.type(screen.getByLabelText('Contact WhatsApp number'), '012-999 8888')
      await userEvent.click(screen.getByRole('button', { name: 'Add contact' }))
      expect(contactHook.state.add).toHaveBeenCalledWith('Teacher Mei', '012-999 8888')
    })

    it('shows why a contact was not saved', async () => {
      contactHook.state.add.mockResolvedValue('Type the WhatsApp number, like 012-345 6789 or +60 12 345 6789.')
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Contacts/ }))
      await userEvent.type(screen.getByLabelText('Contact name'), 'Mei')
      await userEvent.click(screen.getByRole('button', { name: 'Add contact' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Type the WhatsApp number')
    })

    it('changes and removes a contact, asking before removing', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Contacts/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Change Lex' }))
      expect(screen.getByLabelText('Contact name')).toHaveValue('Lex')
      expect(screen.getByLabelText('Contact WhatsApp number')).toHaveValue('+60123456789')
      await userEvent.clear(screen.getByLabelText('Contact name'))
      await userEvent.type(screen.getByLabelText('Contact name'), 'Lex Chew')
      await userEvent.click(screen.getByRole('button', { name: 'Save contact' }))
      expect(contactHook.state.update).toHaveBeenCalledWith(4, 'Lex Chew', '+60123456789')

      await userEvent.click(screen.getByRole('button', { name: 'Remove Lex' }))
      expect(contactHook.state.remove).not.toHaveBeenCalled()
      const buttons = screen.getAllByRole('button', { name: 'Remove' })
      await userEvent.click(buttons[buttons.length - 1])
      await waitFor(() => expect(contactHook.state.remove).toHaveBeenCalledWith(4))
    })

    it('is read-only for someone who is not an admin', async () => {
      setup(false)
      await userEvent.click(screen.getByRole('button', { name: /Contacts/ }))
      expect(screen.getByText('Lex')).toBeInTheDocument()
      expect(screen.queryByLabelText('Contact name')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove Lex' })).not.toBeInTheDocument()
    })

    it('sends a message to a contact when one is chosen under Send to, and back to the parent', async () => {
      setup()
      await openFirst()
      await userEvent.click(screen.getByRole('button', { name: 'canvas block m1' }))
      const sendTo = screen.getByLabelText('Send to')
      expect(sendTo).toHaveValue('')
      expect(screen.getByRole('option', { name: 'Lex · +60 12-345 6789' })).toBeInTheDocument()

      await userEvent.selectOptions(sendTo, '4')
      expect(screen.getByText(/goes to the contact, not to the family/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      expect(hook.state.save.mock.calls[0][0].graph.nodes[0]).toMatchObject({ id: 'm1', contactId: 4 })

      await userEvent.selectOptions(screen.getByLabelText('Send to'), '')
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(2))
      expect(hook.state.save.mock.calls[1][0].graph.nodes[0].contactId ?? null).toBeNull()
    })
  })

  describe('sending by itself', () => {
    const autoFlow = () =>
      flow({
        id: 5,
        name: 'Ads follow up',
        trigger: 'lead_created',
        graph: {
          trigger: { x: 24, y: 140 },
          nodes: [{ id: 'm1', type: 'message', x: 300, y: 140, mins: 5, after: true, text: 'Hi {parent}' }],
          edges: [{ from: 'trigger', port: 'out', to: 'm1' }],
          settings: { autoSend: true },
        },
      })

    it('keeps a flow going through the approval queue until its switch is ticked, and saves the switch', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Class reminder A regular class starts/ }))
      const box = screen.getByRole('checkbox', { name: /Send by itself/ })
      expect(box).not.toBeChecked()
      expect(screen.getByText(/waits in the approval queue/)).toBeInTheDocument()

      await userEvent.click(box)
      expect(screen.getByRole('checkbox', { name: /Send by itself/ })).toBeChecked()
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      expect(hook.state.save.mock.calls[0][0].graph.settings).toEqual({ autoSend: true })
    })

    it('leaves the switch out of the saved flow when it is ticked and then cleared', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Class reminder A regular class starts/ }))
      await userEvent.click(screen.getByRole('checkbox', { name: /Send by itself/ }))
      expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('checkbox', { name: /Send by itself/ }))
      // Back to what was saved: nothing is left over in the flow, so there is nothing to save.
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
    })

    it('marks a flow that sends by itself and asks before turning it on', async () => {
      hook.state.flows = [autoFlow()]
      setup()
      expect(screen.getByText('Sends by itself')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('switch', { name: 'Ads follow up on or off' }))
      expect(await screen.findByText(/without anyone approving them/)).toBeInTheDocument()
      expect(hook.state.toggle).not.toHaveBeenCalled()
      await userEvent.click(screen.getByRole('button', { name: 'Turn on' }))
      await waitFor(() => expect(hook.state.toggle).toHaveBeenCalledWith(5, true))
      expect(await screen.findByText(/go out by themselves/)).toBeInTheDocument()
    })

    it('does not ask when a flow that goes through approval is turned on', async () => {
      setup()
      await userEvent.click(screen.getByRole('switch', { name: 'Class reminder on or off' }))
      await waitFor(() => expect(hook.state.toggle).toHaveBeenCalledWith(1, true))
    })

    it('shows the rules, pauses everything and saves a new daily limit', async () => {
      hook.state.flows = [{ ...autoFlow(), enabled: true }]
      extras.autoSend.senderSeenAt = null
      setup()
      expect(screen.getByText('1 flow sends by itself')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Sending by itself/ }))
      expect(screen.getByRole('alert')).toHaveTextContent(/has not connected yet/)

      await userEvent.click(screen.getByRole('checkbox', { name: /Pause everything/ }))
      expect(extras.saveAutoSend).toHaveBeenCalledWith({ paused: true })

      const limit = screen.getByLabelText('Most messages a day')
      fireEvent.change(limit, { target: { value: '25' } })
      fireEvent.blur(limit)
      await waitFor(() => expect(extras.saveAutoSend).toHaveBeenCalledWith({ dailyCap: 25 }))
    })

    it('says when the sender program is running', async () => {
      hook.state.flows = [{ ...autoFlow(), enabled: true }]
      extras.autoSend.senderSeenAt = new Date().toISOString()
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Sending by itself/ }))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByText(/Sender program: running/)).toBeInTheDocument()
    })

    it('does not let someone who cannot edit change the rules', async () => {
      setup(false)
      await userEvent.click(screen.getByRole('button', { name: /Sending by itself/ }))
      expect(screen.getByRole('checkbox', { name: /Pause everything/ })).toBeDisabled()
      expect(screen.getByLabelText('Most messages a day')).toBeDisabled()
    })
  })

  describe('simple view and recipes', () => {
    it('opens a flow as a list of three steps, with the canvas one click away', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Class reminder A regular class starts/ }))
      expect(screen.getByRole('heading', { name: 'When this happens' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Who it is for' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Then send' })).toBeInTheDocument()
      expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Advanced' }))
      expect(screen.getByTestId('canvas')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Simple' }))
      expect(screen.getByRole('heading', { name: 'Then send' })).toBeInTheDocument()
    })

    it('offers the recipes before a new flow and starts from the one picked', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      expect(screen.getByText('Start a new flow')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: /Follow up a parent who went quiet/ }))

      expect(screen.getByLabelText('Flow name')).toHaveValue('Follow up quiet parents')
      expect(screen.getByLabelText('When')).toHaveValue('parent_no_reply')
      expect(screen.getByRole('button', { name: /^Stage is New or Contacted/ })).toBeInTheDocument()
      // Three messages, none of them switched on yet.
      expect(screen.getAllByText(/after a parent has not replied|after the parent has not replied/i).length).toBeGreaterThan(0)
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      const saved = hook.state.save.mock.calls[0][0]
      expect(saved).toMatchObject({ id: null, trigger: 'parent_no_reply', enabled: false })
      expect(saved.graph.nodes.filter((node: { type: string }) => node.type === 'message')).toHaveLength(3)
      expect(saved.graph.settings).toMatchObject({ stopStages: ['converted', 'lost'], cooldownDays: 14 })
    })

    it('offers "a lead comes in from a source" as a trigger: the new-lead trigger with a Source filter', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      await userEvent.click(screen.getByRole('button', { name: 'Start with a blank flow' }))
      await userEvent.type(screen.getByLabelText('Flow name'), 'Facebook welcome')

      await userEvent.selectOptions(screen.getByLabelText('When'), 'lead_from_source')
      expect(screen.getByLabelText('When')).toHaveValue('lead_from_source')
      expect(screen.getByText(/Tick the sources under/)).toBeInTheDocument()
      // The Source filter was added in front, open, with the sources (not the hidden one) to tick.
      expect(screen.getByRole('checkbox', { name: 'Facebook Ads' })).toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'Old source' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('checkbox', { name: 'Facebook Ads' }))

      await userEvent.click(screen.getByRole('button', { name: 'Add a message' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      const saved = hook.state.save.mock.calls[0][0]
      expect(saved.trigger).toBe('lead_created')
      expect(saved.graph.nodes[0]).toMatchObject({ type: 'condition', kind: 'source', ids: ['3'] })
      expect(saved.graph.nodes[1]).toMatchObject({ type: 'message', after: true })
    })

    it('offers "a lead comes in with a source keyword" with the keywords of the inbox to tick', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      await userEvent.click(screen.getByRole('button', { name: 'Start with a blank flow' }))
      await userEvent.type(screen.getByLabelText('Flow name'), 'Keyword welcome')

      await userEvent.selectOptions(screen.getByLabelText('When'), 'lead_from_keyword')
      expect(screen.getByLabelText('When')).toHaveValue('lead_from_keyword')
      expect(screen.getByText(/Tick the source keywords under/)).toBeInTheDocument()
      // Only the active rules are offered, by their phrase.
      expect(screen.getByRole('checkbox', { name: 'free trial coding' })).toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'old advert' })).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('checkbox', { name: 'free trial coding' }))

      await userEvent.click(screen.getByRole('button', { name: 'Add a message' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))
      const saved = hook.state.save.mock.calls[0][0]
      expect(saved.trigger).toBe('lead_created')
      expect(saved.graph.nodes[0]).toMatchObject({ type: 'condition', kind: 'keyword', ids: ['12'] })
      expect(saved.graph.nodes[1]).toMatchObject({ type: 'message', after: true })
    })

    it('starts a flow for one source from the recipe list', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      await userEvent.click(screen.getByRole('button', { name: /Message leads from one source/ }))
      expect(screen.getByLabelText('When')).toHaveValue('lead_from_source')
      // The Source filter is already in front, with nothing ticked: the sources are left to the person.
      expect(screen.getByRole('button', { name: 'Any source?' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Any source?' }))
      expect(screen.getByRole('checkbox', { name: 'Facebook Ads' })).not.toBeChecked()
    })

    it('does not offer a recipe that tells the team until there is a contact to tell', async () => {
      contactHook.state.contacts = []
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      expect(screen.getByRole('button', { name: /Tell me when lessons run low/ })).toBeDisabled()
      expect(screen.getByText(/Add yourself under Contacts first/)).toBeInTheDocument()
    })

    it('goes back from the recipe list without starting anything', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      await userEvent.click(screen.getByRole('button', { name: 'Automations' }))
      expect(screen.getByRole('button', { name: 'New flow' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Flow name')).not.toBeInTheDocument()
    })

    it('adds a filter and a message from the list and saves them in order', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      await userEvent.click(screen.getByRole('button', { name: 'Start with a blank flow' }))
      await userEvent.type(screen.getByLabelText('Flow name'), 'Ads follow up')

      await userEvent.click(screen.getByRole('button', { name: 'Add a filter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /Age/ }))
      await userEvent.click(screen.getByRole('button', { name: 'Add a message' }))
      await userEvent.click(screen.getByRole('button', { name: 'Save flow' }))
      await waitFor(() => expect(hook.state.save).toHaveBeenCalledTimes(1))

      const { nodes, edges } = hook.state.save.mock.calls[0][0].graph
      expect(nodes.map((node: { type: string }) => node.type)).toEqual(['condition', 'message', 'message'])
      expect(edges).toContainEqual({ from: 'trigger', port: 'out', to: nodes[0].id })
      expect(edges).toContainEqual({ from: nodes[0].id, port: 'yes', to: nodes[1].id })
    })

    it('removes a filter with its X', async () => {
      setup()
      await userEvent.click(screen.getByRole('button', { name: 'New flow' }))
      await userEvent.click(screen.getByRole('button', { name: 'Start with a blank flow' }))
      await userEvent.click(screen.getByRole('button', { name: 'Add a filter' }))
      await userEvent.click(screen.getByRole('menuitem', { name: /Lead stage/ }))
      expect(screen.getByRole('button', { name: 'Remove this filter' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Remove this filter' }))
      expect(screen.queryByRole('button', { name: 'Remove this filter' })).not.toBeInTheDocument()
      expect(screen.getByText(/Everyone\./)).toBeInTheDocument()
    })

    it('sends a flow with a Yes and a No branch to the advanced editor with a note', async () => {
      const branched = flow()
      branched.graph = {
        trigger: { x: 0, y: 0 },
        nodes: [
          { id: 'c1', type: 'condition', kind: 'age', x: 0, y: 0, min: 6, max: 9 },
          { id: 'm1', type: 'message', x: 0, y: 0, mins: 60, text: 'yes' },
          { id: 'm2', type: 'message', x: 0, y: 0, mins: 60, text: 'no' },
        ],
        edges: [
          { from: 'trigger', port: 'out', to: 'c1' },
          { from: 'c1', port: 'yes', to: 'm1' },
          { from: 'c1', port: 'no', to: 'm2' },
        ],
      }
      hook.state.flows = [branched]
      setup()
      await userEvent.click(screen.getByRole('button', { name: /Class reminder A regular class starts/ }))
      expect(screen.getByTestId('canvas')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Simple' }))
      expect(screen.getByText(/too detailed for the simple view/)).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Open the advanced editor' }))
      expect(screen.getByTestId('canvas')).toBeInTheDocument()
    })
  })
})
