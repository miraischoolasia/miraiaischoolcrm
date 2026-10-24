import { describe, expect, it } from 'vitest'
import { checkProductDraft, DEFAULT_PRODUCTS_SETTINGS, isLowStock, productPrice, readProductsSettings, type ProductDraft } from './products'

const draft = (over: Partial<ProductDraft> = {}): ProductDraft => ({
  name: 'P4 Math 宝典',
  category: '宝典',
  levelLabel: 'P4',
  price: '45',
  lowStockAt: '5',
  trackStock: true,
  isActive: true,
  imagePath: null,
  ...over,
})

describe('product settings', () => {
  it('fills in what is missing', () => {
    expect(readProductsSettings(null)).toEqual(DEFAULT_PRODUCTS_SETTINGS)
    const s = readProductsSettings({ enabled: true, categories: ['书'], postage: { west: '8', freeOver: 200 }, shipStates: { shipped: 'Sent' } })
    expect(s.enabled).toBe(true)
    expect(s.categories).toEqual(['书'])
    expect(s.postage).toEqual({ west: 8, east: 20, freeOver: 200, freeWithTuition: true })
    expect(s.shipStates).toEqual({ pending: '待寄', shipped: 'Sent', received: '已收到' })
  })
})

describe('a product form', () => {
  const categories = ['宝典', '笔记']
  it('is fine as filled in', () => {
    expect(checkProductDraft(draft(), categories)).toBeNull()
    expect(checkProductDraft(draft({ price: '0' }), categories)).toBeNull()
  })
  it('says what is wrong', () => {
    expect(checkProductDraft(draft({ name: '  ' }), categories)).toMatch(/name/)
    expect(checkProductDraft(draft({ category: 'Toys' }), categories)).toMatch(/categories/)
    expect(checkProductDraft(draft({ price: '' }), categories)).toMatch(/price/)
    expect(checkProductDraft(draft({ price: '-1' }), categories)).toMatch(/price/)
    expect(checkProductDraft(draft({ price: '1.234' }), categories)).toMatch(/2 decimals/)
    expect(checkProductDraft(draft({ lowStockAt: '1.5' }), categories)).toMatch(/whole number/)
  })
})

describe('stock', () => {
  it('low stock only when stock is kept and at or under the line', () => {
    expect(isLowStock({ trackStock: true, stock: 5, lowStockAt: 5 })).toBe(true)
    expect(isLowStock({ trackStock: true, stock: 6, lowStockAt: 5 })).toBe(false)
    expect(isLowStock({ trackStock: false, stock: 0, lowStockAt: 5 })).toBe(false)
  })
  it('prices in ringgit', () => {
    expect(productPrice({ price: 45 })).toBe('RM45.00')
    expect(productPrice({ price: 1234.5 })).toBe('RM1,234.50')
  })
})
