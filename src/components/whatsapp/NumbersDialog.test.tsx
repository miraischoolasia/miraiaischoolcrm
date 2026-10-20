import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NumbersDialog } from './NumbersDialog'

const main = { id: 1, label: 'Main', phone: '60108079133', inboxId: 1, instance: 'mirai-test', isActive: true }

function setup(overrides: Partial<Parameters<typeof NumbersDialog>[0]> = {}) {
  const props = {
    numbers: [main],
    assignments: new Map([[1, [7]]]),
    staff: [
      { id: 7, name: 'Amy' },
      { id: 8, name: 'Ben' },
    ],
    inboxes: [
      { id: 1, name: 'Mirai' },
      { id: 2, name: 'Mirai Sales' },
    ],
    onSave: vi.fn(async () => null as string | null),
    onRemove: vi.fn(async () => null as string | null),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<NumbersDialog {...props} />)
  return props
}

describe('NumbersDialog', () => {
  it('lists each number with the staff it is given to', () => {
    setup()
    expect(screen.getByText('Main')).toBeInTheDocument()
    expect(screen.getByText('Given to: Amy')).toBeInTheDocument()
  })

  it('adds a number and gives it to the ticked staff', async () => {
    const { onSave } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Add a number' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Sales')
    await userEvent.selectOptions(screen.getByLabelText('Chatwoot inbox'), '2')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Ben' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }))

    expect(onSave).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ label: 'Sales', inboxId: 2, isActive: true }),
      [8],
    )
    // Back to the list after saving.
    expect(screen.getByRole('button', { name: 'Add a number' })).toBeInTheDocument()
  })

  it('keeps the form open and says why when the save fails', async () => {
    setup({ onSave: vi.fn(async () => 'This inbox is already used by another number.') })
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save number' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already used')
  })

  it('asks twice before removing a number', async () => {
    const { onRemove } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Really remove?' }))
    expect(onRemove).toHaveBeenCalledWith(main)
  })

  describe('linking each number by its own QR code', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    const second = { id: 2, label: 'Second', phone: null, inboxId: 6, instance: 'school-2', isActive: true }
    const stubGateway = () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ instance: { state: 'close' } }), { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      return fetchMock
    }
    // What the Link panels asked (the list of the server's numbers is asked too, and is not counted here).
    const asked = (fetchMock: ReturnType<typeof vi.fn>) =>
      fetchMock.mock.calls.map((call) => String((call as unknown[])[0])).filter((url) => url.includes('/wa/connect/'))

    it('gives every named number its own Link panel, asking about that number only', async () => {
      const fetchMock = stubGateway()
      setup({ numbers: [{ ...main, instance: 'school-1' }, second], apiUrl: 'https://wa.example' })

      expect(await screen.findByRole('region', { name: 'Link Phone of Main' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Link Phone of Second' })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Show QR code' })).toHaveLength(2)
      await waitFor(() =>
        expect(asked(fetchMock).sort()).toEqual([
          'https://wa.example/wa/connect/state?instance=school-1',
          'https://wa.example/wa/connect/state?instance=school-2',
        ]),
      )
      // No panel for "the school's phone" beside them.
      expect(screen.queryByRole('region', { name: 'Link WhatsApp phone' })).not.toBeInTheDocument()
      expect(screen.queryByRole('note')).not.toBeInTheDocument()
    })

    it('says which number still needs its Evolution name, the first one too', async () => {
      stubGateway()
      setup({ numbers: [{ ...main, instance: null }, second], apiUrl: 'https://wa.example' })

      expect(screen.getByRole('note')).toHaveTextContent('the first one too')
      expect(screen.getByRole('note')).toHaveTextContent('Main (inbox 1)')
      expect(screen.getByRole('note')).not.toHaveTextContent('Second (inbox 6)')
      expect(await screen.findByRole('region', { name: 'Link Phone of Second' })).toBeInTheDocument()
    })

    it('keeps the one panel of a school with one number and no names, as before', async () => {
      const fetchMock = stubGateway()
      setup({ numbers: [], apiUrl: 'https://wa.example' })

      expect(await screen.findByRole('region', { name: 'Link WhatsApp phone' })).toBeInTheDocument()
      expect(asked(fetchMock)).toEqual(['https://wa.example/wa/connect/state'])
    })
  })

  describe('adding and turning numbers off on the WhatsApp server', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })
    const second = { id: 2, label: 'Second', phone: null, inboxId: 6, instance: 'school-2', isActive: true }
    const serverList = [
      { instance: 'school-1', inboxId: 1, label: 'Main', state: 'open' as const, active: true },
      { instance: 'school-2', inboxId: 6, label: 'Second', state: 'close' as const, active: true },
    ]
    function fakeServer(list = serverList) {
      return {
        list: vi.fn(async () => list),
        add: vi.fn(async () => ({ instance: 'school-3', inboxId: 7 })),
        turnOff: vi.fn(async () => undefined),
        turnOn: vi.fn(async () => undefined),
      }
    }
    // The Link panels ask the gateway about each number.
    const stubGateway = () =>
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ instance: { state: 'close' } }), { status: 200 })))

    it('adds a number by its name only, after a yes, and reads the list again', async () => {
      stubGateway()
      const server = fakeServer()
      const onReload = vi.fn(async () => undefined)
      setup({ numbers: [{ ...main, instance: 'school-1' }, second], apiUrl: 'https://wa.example', numbersApi: server as never, onReload })

      await userEvent.click(await screen.findByRole('button', { name: 'Add a number' }))
      await userEvent.type(screen.getByLabelText('Name of the new number'), 'Sales')
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
      // Nothing happens before the yes.
      expect(server.add).not.toHaveBeenCalled()
      expect(screen.getByRole('alertdialog')).toHaveTextContent('Add a new WhatsApp number called "Sales"?')
      await userEvent.click(screen.getByRole('button', { name: 'Yes, add it' }))

      await waitFor(() => expect(server.add).toHaveBeenCalledWith('Sales'))
      expect(onReload).toHaveBeenCalled()
      // The hand-written form is not used: the server writes the number into the list.
      expect(screen.queryByLabelText('Chatwoot inbox')).not.toBeInTheDocument()
    })

    it('asks before turning a number off, and warns more for the first number', async () => {
      stubGateway()
      const server = fakeServer()
      setup({ numbers: [{ ...main, instance: 'school-1' }, second], apiUrl: 'https://wa.example', numbersApi: server as never })

      const turnOff = await screen.findAllByRole('button', { name: 'Turn off' })
      await userEvent.click(turnOff[0])
      expect(screen.getByRole('alertdialog')).toHaveTextContent("the school's first number")
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(server.turnOff).not.toHaveBeenCalled()

      await userEvent.click(screen.getAllByRole('button', { name: 'Turn off' })[1])
      expect(screen.getByRole('alertdialog')).not.toHaveTextContent('first number')
      await userEvent.click(screen.getByRole('button', { name: 'Yes, turn it off' }))
      await waitFor(() => expect(server.turnOff).toHaveBeenCalledWith('school-2'))
    })

    it('shows a number that is off, with Turn on instead of its QR code', async () => {
      stubGateway()
      const server = fakeServer([serverList[0], { ...serverList[1], active: false }])
      setup({ numbers: [{ ...main, instance: 'school-1' }, second], apiUrl: 'https://wa.example', numbersApi: server as never })

      expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument()
      expect(screen.getByText('(off: chats can be read, not answered)')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Link Phone of Second' })).not.toBeInTheDocument()
    })

    it('offers to add the numbers the server has that the list does not', async () => {
      stubGateway()
      const server = fakeServer()
      const props = setup({ numbers: [], apiUrl: 'https://wa.example', numbersApi: server as never })

      expect(await screen.findByText('On the WhatsApp server, not in this list yet')).toBeInTheDocument()
      await userEvent.click(screen.getAllByRole('button', { name: 'Add to the list' })[1])
      expect(props.onSave).toHaveBeenCalledWith(
        null,
        { label: 'Second', phone: '', inboxId: 6, instance: 'school-2', isActive: true },
        [],
      )
    })

    it('keeps the hand-written form for a school whose server cannot add numbers', async () => {
      stubGateway()
      const server = { ...fakeServer(), list: vi.fn(async () => null) }
      setup({ apiUrl: 'https://wa.example', numbersApi: server as never })

      await waitFor(() => expect(server.list).toHaveBeenCalled())
      await userEvent.click(screen.getByRole('button', { name: 'Add a number' }))
      expect(screen.getByLabelText('Chatwoot inbox')).toBeInTheDocument()
    })
  })
})

