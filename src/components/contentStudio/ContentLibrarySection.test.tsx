import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LibraryItem } from '../../lib/contentStudio'

const api = vi.hoisted(() => ({ fetchLibrary: vi.fn(), claimItem: vi.fn() }))
vi.mock('../../lib/contentStudio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/contentStudio')>()),
  fetchLibrary: api.fetchLibrary,
  claimItem: api.claimItem,
}))

import { ContentLibrarySection } from './ContentLibrarySection'

const item = (change: Partial<LibraryItem>): LibraryItem => ({
  id: 1,
  briefId: 1,
  briefTitle: 'Holiday Camp',
  styleId: 1,
  styleName: 'Cartoon',
  angleId: 1,
  angleName: 'Pain',
  headline: 'Open post',
  subheadline: '',
  posterText: '',
  caption: '家长们好！',
  size: '1:1',
  kind: 'single',
  pages: 1,
  approvedAt: '2026-10-21T00:00:00Z',
  claimedCount: 2,
  claimLimit: 3,
  myClaimedAt: null,
  ...change,
})

describe('ContentLibrarySection', () => {
  beforeEach(() => {
    api.fetchLibrary.mockReset()
    api.claimItem.mockReset()
  })

  it('shows x/y claimed, claims and copies the caption, and shows a full post as all claimed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    api.fetchLibrary.mockResolvedValue([item({}), item({ id: 2, headline: 'Full post', claimedCount: 3 })])
    api.claimItem.mockResolvedValue({ already: false, claimedCount: 3, claimLimit: 3, claimedAt: '2026-10-21T08:00:00Z' })

    render(<ContentLibrarySection />)
    expect(await screen.findByText('Open post')).toBeInTheDocument()
    expect(screen.getByText('2/3 claimed')).toBeInTheDocument()
    expect(screen.getByText('Fully claimed · 3/3 claimed')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All claimed' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: /Claim & copy caption/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('家长们好！'))
    expect(api.claimItem).toHaveBeenCalledWith(1)
    expect(await screen.findByText('Claimed and copied. Paste it into your post.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Copy caption again/ })).toBeInTheDocument()
  })

  it('says why a claim was refused', async () => {
    api.fetchLibrary.mockResolvedValue([item({})])
    api.claimItem.mockRejectedValue({ code: 'P0001', message: 'All places for this post have been claimed.' })
    render(<ContentLibrarySection />)
    await userEvent.click(await screen.findByRole('button', { name: /Claim & copy caption/ }))
    expect(await screen.findByText('All places for this post have been claimed.')).toBeInTheDocument()
  })
})
