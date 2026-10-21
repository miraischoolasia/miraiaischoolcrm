import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchTagPicRules = vi.fn()
const setTagPicLink = vi.fn()
vi.mock('../../lib/familyHandler', () => ({
  fetchTagPicRules: () => fetchTagPicRules(),
  setTagPicLink: (...args: unknown[]) => setTagPicLink(...args),
}))

import { TagPicLinksSection } from './TagPicLinksSection'

describe('TagPicLinksSection', () => {
  beforeEach(() => {
    fetchTagPicRules.mockReset().mockResolvedValue({
      tags: [
        { id: 1, label: 'Violet', isActive: true, picOptionId: null },
        { id: 2, label: 'Crystal', isActive: true, picOptionId: 11 },
      ],
      pics: [
        { id: 10, label: 'Violet' },
        { id: 11, label: 'Crystal Kong' },
      ],
    })
    setTagPicLink.mockReset().mockResolvedValue(undefined)
  })

  it('lists each tag with the PIC it names', async () => {
    render(<TagPicLinksSection />)

    expect(await screen.findByLabelText('PIC of the tag Violet')).toHaveValue('')
    expect(screen.getByLabelText('PIC of the tag Crystal')).toHaveValue('11')
  })

  it('saves the PIC chosen for a tag, and takes it off again', async () => {
    render(<TagPicLinksSection />)

    await userEvent.selectOptions(await screen.findByLabelText('PIC of the tag Violet'), 'Violet')
    await waitFor(() => expect(setTagPicLink).toHaveBeenCalledWith(1, 10))
    await userEvent.selectOptions(screen.getByLabelText('PIC of the tag Crystal'), 'No PIC')
    await waitFor(() => expect(setTagPicLink).toHaveBeenCalledWith(2, null))
  })

  it('says why when saving did not work', async () => {
    setTagPicLink.mockRejectedValue(new Error('Only an admin can link a tag to a PIC.'))
    render(<TagPicLinksSection />)

    await userEvent.selectOptions(await screen.findByLabelText('PIC of the tag Violet'), 'Violet')
    expect(await screen.findByText('Only an admin can link a tag to a PIC.')).toBeInTheDocument()
  })
})
