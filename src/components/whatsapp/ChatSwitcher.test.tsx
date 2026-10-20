import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatSwitcher } from './ChatSwitcher'
import type { ChatSwitchOption } from '../../lib/chatSwitch'

const option = (key: string, extra: Partial<ChatSwitchOption>): ChatSwitchOption => ({
  key,
  kind: 'whatsapp',
  conversationId: Number(key),
  contactId: Number(key) * 10,
  account: 'Mirai WhatsApp',
  who: 'Jack',
  isChild: false,
  lastAt: null,
  current: false,
  ...extra,
})

describe('ChatSwitcher', () => {
  it('is only a label when the family has one chat', () => {
    render(<ChatSwitcher label="Messenger: Jack老师" options={[option('1', { current: true })]} onPick={vi.fn()} />)
    expect(screen.getByText('Messenger: Jack老师')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('lists the chats of the family, ticks the open one, and switches to the one picked', async () => {
    const onPick = vi.fn()
    const options = [
      option('1', { account: 'Mirai WhatsApp · 012-345 6789', current: true }),
      option('2', { kind: 'messenger', account: 'Messenger: EduHero Page', who: 'Jack Lim' }),
      option('3', { account: 'Mirai WhatsApp · 012-345 6789', who: 'Child Lucas', isChild: true }),
    ]
    render(<ChatSwitcher label="Mirai WhatsApp · 012-345 6789" options={options} onPick={onPick} />)

    await userEvent.click(screen.getByRole('button', { name: /Sending from/ }))
    const menu = screen.getByRole('menu', { name: 'Chats of this family' })
    const rows = within(menu).getAllByRole('menuitemradio')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute('aria-checked', 'true')
    expect(rows[1]).toHaveTextContent('Messenger: EduHero Page')
    expect(rows[2]).toHaveTextContent('ChildLucas')

    // The open chat stays as it is.
    await userEvent.click(rows[0])
    expect(onPick).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /Sending from/ }))
    await userEvent.click(within(screen.getByRole('menu')).getAllByRole('menuitemradio')[1])
    expect(onPick).toHaveBeenCalledWith(options[1])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
