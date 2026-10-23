import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MyQuotationLinks, SchoolQrField, StaffLinksEditor } from './QuotationLinks'

describe('§15 links and QR', () => {
  it('an EC saves their own links; only https links are taken', async () => {
    const user = userEvent.setup()
    const save = vi.fn(async () => null)
    render(<MyQuotationLinks loadMe={async () => 5} loadLinks={async () => []} save={save} />)
    await user.click(await screen.findByText(/My links/))
    const afterPay = screen.getByLabelText('After paying, go to')
    await user.type(afterPay, 'http://bad.example')
    expect(screen.getByText('A link must start with https:// and have no spaces.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save links' })).toBeDisabled()
    await user.clear(afterPay)
    await user.type(afterPay, 'https://wa.me/60177')
    await user.click(screen.getByRole('button', { name: 'Save links' }))
    expect(save).toHaveBeenCalledWith(5, 'https://wa.me/60177', null)
    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })

  it('an admin sets another EC’s links', async () => {
    const user = userEvent.setup()
    const save = vi.fn(async () => null)
    render(
      <StaffLinksEditor
        loadStaff={async () => [{ id: 7, name: 'Amy' }]}
        loadLinks={async () => [{ teacherId: 7, afterPayUrl: 'https://old.example', contactUrl: null }]}
        save={save}
      />,
    )
    const field = await screen.findByLabelText('After paying, go to (Amy)')
    expect(field).toHaveValue('https://old.example')
    await user.clear(field)
    await user.click(screen.getByRole('button', { name: 'Save links' }))
    expect(save).toHaveBeenCalledWith(7, null, null)
  })

  it('the school QR: upload sets the path; remove clears it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const upload = vi.fn(async () => ({ ok: true as const, path: 'qr/bank-1.png', url: 'https://x/qr/bank-1.png' }))
    const { rerender } = render(<SchoolQrField path={null} onChange={onChange} upload={upload} urlFor={(p) => `https://x/${p}`} />)
    await user.upload(screen.getByLabelText('Upload QR picture'), new File(['png'], 'qr.png', { type: 'image/png' }))
    expect(onChange).toHaveBeenCalledWith('qr/bank-1.png')
    rerender(<SchoolQrField path="qr/bank-1.png" onChange={onChange} upload={upload} urlFor={(p) => `https://x/${p}`} />)
    expect(screen.getByRole('img', { name: 'School bank QR' })).toHaveAttribute('src', 'https://x/qr/bank-1.png')
    await user.click(screen.getByRole('button', { name: /Remove/ }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })
})
