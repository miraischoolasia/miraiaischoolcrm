import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CalendarBlank, Chalkboard, Funnel, GearSix, House, IdentificationBadge, Images, Package, WhatsappLogo } from '@phosphor-icons/react'
import { MobileNav, PageTabs, SideNav, type NavEntry } from './AppNav'

const openPackages = vi.fn()
const entries: NavEntry[] = [
  { id: 'home', label: 'Today', icon: House, section: 'home' },
  { id: 'leads', label: 'Leads', icon: Funnel, group: 'marketing', section: 'leads', badge: { count: 3, noun: 'new' } },
  { id: 'whatsapp', label: 'Inbox', icon: WhatsappLogo, group: 'marketing', section: 'whatsapp', badge: { count: 2, noun: 'chats waiting' } },
  { id: 'content-studio', label: 'Content Studio', icon: Images, group: 'media', section: 'content-studio' },
  { id: 'calendar', label: 'Timetable', icon: CalendarBlank, group: 'course', section: 'calendar' },
  { id: 'classrooms', label: 'My Classroom', icon: Chalkboard, group: 'course', section: 'classrooms' },
  { id: 'teachers', label: 'My Team', icon: IdentificationBadge, group: 'admin', section: 'teachers' },
  { id: 'packages', label: 'Package', icon: Package, group: 'admin', onSelect: openPackages },
  { id: 'class-settings', label: 'Class Settings', icon: GearSix, group: 'admin', onSelect: vi.fn() },
]

describe('SideNav', () => {
  it('lists Today and the categories only, with what waits inside each, and marks the open page\'s category', () => {
    render(<SideNav entries={entries} activeSection="classrooms" collapsed={false} onSelect={vi.fn()} />)
    const nav = within(screen.getByRole('navigation', { name: 'Menu' }))
    expect(nav.getAllByRole('button').map((button) => button.textContent?.replace(/\d+$/, ''))).toEqual(['Today', 'Marketing', 'Media', 'My Course', 'Admin'])
    expect(nav.queryByRole('button', { name: /Leads/ })).not.toBeInTheDocument()
    expect(within(nav.getByRole('button', { name: /Marketing/ })).getByLabelText('5 waiting')).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /My Course/ })).toHaveAttribute('aria-current', 'page')
  })

  it('goes to a category\'s first page (not a window such as Package)', async () => {
    const onSelect = vi.fn()
    const adminWindowsFirst = [entries[0], entries[7], entries[8], entries[6]]
    render(<SideNav entries={adminWindowsFirst} activeSection="home" collapsed={false} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Admin/ }))
    expect(onSelect).toHaveBeenLastCalledWith(entries[6])
  })

  it('hides a category this login has no page in', () => {
    render(<SideNav entries={entries.filter((entry) => entry.group !== 'media')} activeSection="home" collapsed={false} onSelect={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Media/ })).not.toBeInTheDocument()
  })

  it('shows only the category icons, named for screen readers, when the menu is narrow', () => {
    render(<SideNav entries={entries} activeSection="home" collapsed onSelect={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Marketing' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Leads' })).not.toBeInTheDocument()
  })
})

describe('PageTabs', () => {
  it('shows the open page\'s category as tabs, marks the page, and marks an entry that opens a window', async () => {
    const onSelect = vi.fn()
    render(<PageTabs entries={entries} activeSection="teachers" onSelect={onSelect} />)
    const tabs = within(screen.getByRole('navigation', { name: 'Admin pages' }))
    expect(tabs.getAllByRole('button').map((button) => button.textContent)).toEqual(['My Team', 'Package', 'Class Settings'])
    expect(tabs.getByRole('button', { name: 'My Team' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs.getByRole('button', { name: 'Package' })).getByTitle('Opens in a window')).toBeInTheDocument()

    await userEvent.click(tabs.getByRole('button', { name: 'Package' }))
    expect(onSelect).toHaveBeenLastCalledWith(entries[7])
  })

  it('shows nothing on Today or in a category with one page', () => {
    const { rerender } = render(<PageTabs entries={entries} activeSection="home" onSelect={vi.fn()} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    rerender(<PageTabs entries={entries} activeSection="content-studio" onSelect={vi.fn()} />)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })

  it('shows what waits on a tab', () => {
    render(<PageTabs entries={entries} activeSection="leads" onSelect={vi.fn()} />)
    expect(screen.getByLabelText('2 chats waiting')).toBeInTheDocument()
  })
})

describe('MobileNav', () => {
  it('has Today and the busiest categories along the bottom, and the others under More', async () => {
    const onSelect = vi.fn()
    render(<MobileNav entries={entries} activeSection="home" onSelect={onSelect} />)
    const bar = within(screen.getByRole('navigation', { name: 'Menu' }))
    expect(bar.getAllByRole('button').map((button) => button.textContent)).toEqual(['Today', 'Marketing', 'My Course', 'More'])

    // A category goes to its first page.
    await userEvent.click(bar.getByRole('button', { name: /Marketing/ }))
    expect(onSelect).toHaveBeenLastCalledWith(entries[1])

    await userEvent.click(bar.getByRole('button', { name: /More/ }))
    const more = within(screen.getByRole('menu', { name: 'More' }))
    expect(more.getAllByRole('menuitem')).toHaveLength(2)
    await userEvent.click(more.getByRole('menuitem', { name: /^Admin/ }))
    expect(onSelect).toHaveBeenLastCalledWith(entries[6])
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('has no More when every category fits in the bar', () => {
    render(<MobileNav entries={entries.filter((entry) => entry.group !== 'media' && entry.group !== 'admin')} activeSection="home" onSelect={vi.fn()} />)
    expect(within(screen.getByRole('navigation', { name: 'Menu' })).queryByRole('button', { name: /More/ })).not.toBeInTheDocument()
  })
})
