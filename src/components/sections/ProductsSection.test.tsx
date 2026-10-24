import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductsSection, type ProductsApi } from './ProductsSection'
import { DEFAULT_PRODUCTS_SETTINGS, type Product } from '../../lib/products'

const book = (over: Partial<Product>): Product => ({
  id: 1,
  name: 'P4 Math 宝典',
  category: '宝典',
  levelLabel: 'P4 · Math',
  price: 45,
  imagePath: 'p/a.png',
  trackStock: true,
  lowStockAt: 3,
  isActive: true,
  sortOrder: 10,
  stock: 20,
  ...over,
})

function fakeApi(over: Partial<ProductsApi> = {}): ProductsApi {
  return {
    settings: vi.fn(async () => ({ ...DEFAULT_PRODUCTS_SETTINGS, enabled: true })),
    saveSettings: vi.fn(async () => null),
    products: vi.fn(async () => ({
      rows: [book({}), book({ id: 2, name: 'F1 Sci 笔记', category: '笔记', stock: 2 }), book({ id: 3, name: 'Old book', isActive: false })],
      error: null,
    })),
    save: vi.fn(async () => ({ id: 9, error: null })),
    moves: vi.fn(async () => [{ id: 1, productId: 1, qty: 20, kind: 'purchase' as const, note: 'From the printer', createdBy: 1, createdAt: '2026-10-23T10:00:00Z' }]),
    addMove: vi.fn(async () => ({ stock: 25, error: null })),
    upload: vi.fn(async () => ({ ok: true as const, path: 'p/new.png' })),
    imageUrl: vi.fn((path: string | null) => (path ? `https://x.example/${path}` : null)),
    ...over,
  }
}

describe('Products', () => {
  it('lists the shown products with price and stock, warns about low stock, hides hidden ones', async () => {
    render(<ProductsSection isAdmin={false} canEdit={false} api={fakeApi()} />)
    expect(await screen.findByText('P4 Math 宝典')).toBeInTheDocument()
    expect(screen.getAllByText('RM45.00').length).toBe(2)
    expect(screen.getByRole('status')).toHaveTextContent('Low stock: F1 Sci 笔记 (2)')
    expect(screen.queryByText('Old book')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Add a product' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('adds a product with a picture; the form checks itself first', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    render(<ProductsSection isAdmin canEdit api={api} />)
    await user.click(await screen.findByRole('button', { name: '+ Add a product' }))
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(screen.getByText('Give the product a name.')).toBeInTheDocument()
    expect(api.save).not.toHaveBeenCalled()
    await user.type(screen.getByRole('textbox', { name: 'Product name' }), 'P5 English 宝典')
    await user.type(screen.getByRole('spinbutton', { name: 'Price' }), '50')
    await user.upload(screen.getByLabelText('Picture'), new File(['x'], 'b.png', { type: 'image/png' }))
    expect(await screen.findByRole('img', { name: 'Product picture' })).toHaveAttribute('src', 'https://x.example/p/new.png')
    await user.click(screen.getByRole('button', { name: 'Save product' }))
    expect(api.save).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'P5 English 宝典', category: '宝典', price: '50', imagePath: 'p/new.png' }))
  })

  it('stock: an adjustment needs a reason; a purchase saves and shows the new stock', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    render(<ProductsSection isAdmin canEdit api={api} />)
    await user.click(await screen.findByRole('tab', { name: 'Stock' }))
    expect(await screen.findByText('From the printer')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Stock change' }), 'adjust')
    await user.type(screen.getByRole('spinbutton', { name: 'How many' }), '-2')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Say why the stock is adjusted.')).toBeInTheDocument()
    expect(api.addMove).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Stock change' }), 'purchase')
    await user.clear(screen.getByRole('spinbutton', { name: 'How many' }))
    await user.type(screen.getByRole('spinbutton', { name: 'How many' }), '5')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.addMove).toHaveBeenCalledWith(1, 'purchase', 5, '')
    expect(await screen.findByText('Saved. Stock now 25.')).toBeInTheDocument()
  })

  it('settings (admin): switch on, categories, postage, free from an amount', async () => {
    const user = userEvent.setup()
    const api = fakeApi({ settings: vi.fn(async () => DEFAULT_PRODUCTS_SETTINGS) })
    render(<ProductsSection isAdmin canEdit api={api} />)
    expect(await screen.findByText(/switched off for this school/)).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    const box = screen.getByRole('group', { name: 'Product settings' })
    await user.click(within(box).getByRole('checkbox', { name: /Products are on/ }))
    await user.clear(within(box).getByRole('spinbutton', { name: 'Postage west' }))
    await user.type(within(box).getByRole('spinbutton', { name: 'Postage west' }), '8')
    await user.type(within(box).getByRole('spinbutton', { name: 'Free postage from' }), '200')
    await user.click(within(box).getByRole('button', { name: 'Save settings' }))
    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, categories: ['宝典', '笔记', '其他'], postage: { west: 8, east: 20, freeOver: 200, freeWithTuition: true } }),
    )
  })
})
