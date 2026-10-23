import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LandingPageRow } from './landingApi'

const api = vi.hoisted(() => ({
  listLandingPages: vi.fn(),
  loadLandingPage: vi.fn(),
  createLandingPage: vi.fn(),
  deleteLandingPage: vi.fn(),
  updateLandingPageInfo: vi.fn(),
}))
vi.mock('./landingApi', () => api)
// The real editor (Puck) is tested by hand; here it only has to open with the right page.
vi.mock('./LandingEditor', () => ({
  LandingEditor: ({ page, onClose }: { page: { title: string }; onClose: () => void }) => (
    <div role="dialog" aria-label={`编辑 ${page.title}`}>
      <button type="button" onClick={onClose}>关闭</button>
    </div>
  ),
}))

import { LandingPagesSection } from './LandingPagesSection'

const page = (overrides: Partial<LandingPageRow>): LandingPageRow => ({
  id: 'p1',
  slug: 'book-fair',
  title: 'Book fair',
  status: 'published',
  views: 12,
  data_version: 1,
  published_data_version: 1,
  published_at: '2026-10-23T08:00:00Z',
  updated_at: '2026-10-23T09:00:00Z',
  created_at: '2026-10-22T09:00:00Z',
  ...overrides,
})

describe('LandingPagesSection', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    api.listLandingPages.mockResolvedValue([page({}), page({ id: 'p2', slug: 'camp', title: 'Camp', status: 'draft', views: 0, published_at: null })])
  })

  it('lists the pages with their state and visits, and only offers what the tick allows', async () => {
    render(<LandingPagesSection canEdit={false} canDelete={false} />)
    const fair = (await screen.findByRole('heading', { name: 'Book fair' })).closest('li')!
    expect(within(fair).getByText('已发布')).toBeInTheDocument()
    expect(within(fair).getByText('12')).toBeInTheDocument()
    expect(within(fair).getByRole('link', { name: /打开/ })).toHaveAttribute('href', expect.stringMatching(/\/p\/book-fair$/))
    expect(screen.queryByRole('button', { name: /新页面/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /编辑/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument()
    const camp = screen.getByRole('heading', { name: 'Camp' }).closest('li')!
    expect(within(camp).getByText('草稿')).toBeInTheDocument()
    expect(within(camp).queryByRole('link', { name: /打开/ })).not.toBeInTheDocument()
  })

  it('makes a new page from the course template with an address from its name, then opens the editor', async () => {
    api.createLandingPage.mockResolvedValue(page({ id: 'new', slug: 'open-day', title: 'Open Day', status: 'draft' }))
    api.loadLandingPage.mockResolvedValue({ ...page({ id: 'new', slug: 'open-day', title: 'Open Day', status: 'draft' }), draft_data: {} })
    render(<LandingPagesSection canEdit canDelete />)
    await userEvent.click(await screen.findByRole('button', { name: /新页面/ }))
    const dialog = screen.getByRole('dialog', { name: '新页面' })
    await userEvent.type(within(dialog).getByLabelText('页面名称'), 'Open Day')
    expect(within(dialog).getByLabelText('网址')).toHaveValue('open-day')
    await userEvent.click(within(dialog).getByRole('button', { name: '建立并编辑' }))

    await waitFor(() => expect(api.createLandingPage).toHaveBeenCalled())
    const [title, slug, data] = api.createLandingPage.mock.calls[0]
    expect([title, slug]).toEqual(['Open Day', 'open-day'])
    expect(data.content.map((block: { type: string }) => block.type)).toEqual(['Hero', 'Text', 'Columns', 'Faq', 'Cta'])
    expect(await screen.findByRole('dialog', { name: '编辑 Open Day' })).toBeInTheDocument()
  })

  it('says what is wrong with an address before saving', async () => {
    render(<LandingPagesSection canEdit canDelete />)
    await userEvent.click(await screen.findByRole('button', { name: /新页面/ }))
    const dialog = screen.getByRole('dialog', { name: '新页面' })
    await userEvent.type(within(dialog).getByLabelText('页面名称'), '年终书展')
    await userEvent.click(within(dialog).getByRole('button', { name: '建立并编辑' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('请填网址')
    expect(api.createLandingPage).not.toHaveBeenCalled()
  })

  it('takes a page down and deletes one after asking', async () => {
    window.confirm = vi.fn(() => true)
    api.updateLandingPageInfo.mockResolvedValue(undefined)
    api.deleteLandingPage.mockResolvedValue(undefined)
    render(<LandingPagesSection canEdit canDelete />)
    const fair = (await screen.findByRole('heading', { name: 'Book fair' })).closest('li')!
    await userEvent.click(within(fair).getByRole('button', { name: /下架/ }))
    expect(api.updateLandingPageInfo).toHaveBeenCalledWith('p1', { status: 'unpublished' })
    await userEvent.click(within(fair).getByRole('button', { name: '删除 Book fair' }))
    expect(api.deleteLandingPage).toHaveBeenCalledWith('p1')
  })
})
