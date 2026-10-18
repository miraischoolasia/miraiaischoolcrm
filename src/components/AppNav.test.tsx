import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chalkboard, Funnel, House, Package, WhatsappLogo } from '@phosphor-icons/react'
import { MobileNav, SideNav, type NavEntry } from './AppNav'

const openPackages = vi.fn()
const entries: NavEntry[] = [
  { id: 'home', label: 'Today', icon: House, section: 'home' },
  { id: 'leads', label: 'Leads', icon: Funnel, group: 'marketing', section: 'leads', badge: { count: 3, noun: 'new' } },
  { id: 'whatsapp', label: 'Inbox', icon: WhatsappLogo, group: 'marketing', section: 'whatsapp' },
  { id: 'classrooms', label: 'My Classroom', icon: Chalkboard, group: 'teaching', section: 'classrooms' },
  { id: 'packages', label: 'Packages', icon: Package, group: 'students', onSelect: openPackages },
]

describe('SideNav', () => {
  it('shows Today and the groups; a group opens to its pages, and the open page\'s group starts open', async () => {
    const onSelect = vi.fn()
    render(<SideNav entries={entries} activeSection="classrooms" collapsed={false} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: 'My Classroom' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leads' })).not.toBeInTheDocument()
    // A folded group shows what waits inside it.
    expect(within(screen.getByRole('button', { name: /Marketing/ })).getByLabelText('3 waiting')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Marketing/ }))
    await userEvent.click(screen.getByRole('button', { name: /Leads/ }))
    expect(onSelect).toHaveBeenCalledWith(entries[1])
  })

  it('lists every page with icons only when the menu is narrow', () => {
    render(<SideNav entries={entries} activeSection="home" collapsed onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Leads' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Packages' })).toBeInTheDocument()
  })
})

describe('SideNav one group at a time', () => {
  const folded = (name: RegExp) => screen.getByRole('button', { name }).getAttribute('aria-expanded') === 'false'

  it('folds the open group when another is opened, and opens the same one again to fold it', async () => {
    render(<SideNav entries={entries} activeSection="home" collapsed={false} onSelect={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /Marketing/ }))
    expect(screen.getByRole('button', { name: /Leads/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Teaching/ }))
    expect(screen.getByRole('button', { name: 'My Classroom' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Leads/ })).not.toBeInTheDocument()
    expect(folded(/Marketing/)).toBe(true)

    await userEvent.click(screen.getByRole('button', { name: /Teaching/ }))
    expect(screen.queryByRole('button', { name: 'My Classroom' })).not.toBeInTheDocument()
  })

  it('follows the page: the first page that settles after loading, and Today, do not leave a group open', () => {
    // The app starts on the calendar-like first page, then settles on Today once the login is known.
    const { rerender } = render(<SideNav entries={entries} activeSection="classrooms" collapsed={false} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'My Classroom' })).toBeInTheDocument()

    rerender(<SideNav entries={entries} activeSection="home" collapsed={false} onSelect={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'My Classroom' })).not.toBeInTheDocument()
    expect(folded(/Teaching/)).toBe(true)

    rerender(<SideNav entries={entries} activeSection="leads" collapsed={false} onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Leads/ })).toBeInTheDocument()
  })
})

describe('MobileNav', () => {
  it('has Today and the groups along the bottom; a group opens its pages above the bar', async () => {
    const onSelect = vi.fn()
    render(<MobileNav entries={entries} activeSection="home" onSelect={onSelect} />)
    const bar = within(screen.getByRole('navigation', { name: 'Menu' }))
    expect(bar.getAllByRole('button').map((button) => button.textContent)).toEqual(['Today', 'Marketing', 'Teaching', 'Students'])

    // A group with one page goes straight there.
    await userEvent.click(bar.getByRole('button', { name: /Teaching/ }))
    expect(onSelect).toHaveBeenLastCalledWith(entries[3])

    await userEvent.click(bar.getByRole('button', { name: /Marketing/ }))
    await userEvent.click(within(screen.getByRole('menu', { name: 'Marketing' })).getByRole('menuitem', { name: /Leads/ }))
    expect(onSelect).toHaveBeenLastCalledWith(entries[1])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
