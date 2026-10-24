import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'
import type { Json } from '../types/database'

// Products, part 1 (20261101500000_products.sql): the books a school sells, their stock and pictures, and the
// school's product settings (on / off, categories, postage per order, shipping state names). Selling them on a
// quotation and shipping are part 2; their settings are kept here already.

export type ShipState = 'pending' | 'shipped' | 'received'
export type ProductsSettings = {
  enabled: boolean
  categories: string[]
  postage: { west: number; east: number; freeOver: number | null; freeWithTuition: boolean }
  shipStates: Record<ShipState, string>
}

export const DEFAULT_PRODUCTS_SETTINGS: ProductsSettings = {
  enabled: false,
  categories: ['宝典', '笔记', '其他'],
  postage: { west: 10, east: 20, freeOver: null, freeWithTuition: true },
  shipStates: { pending: '待寄', shipped: '已寄', received: '已收到' },
}

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const num = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}

export function readProductsSettings(raw: unknown): ProductsSettings {
  const d = DEFAULT_PRODUCTS_SETTINGS
  const v = record(raw)
  const postage = record(v.postage)
  const states = record(v.shipStates)
  const categories = Array.isArray(v.categories) ? v.categories.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : []
  const name = (key: ShipState) => (typeof states[key] === 'string' && (states[key] as string).trim() ? (states[key] as string) : d.shipStates[key])
  return {
    enabled: v.enabled === true,
    categories: categories.length > 0 ? categories : d.categories,
    postage: {
      west: num(postage.west, d.postage.west),
      east: num(postage.east, d.postage.east),
      freeOver: postage.freeOver === null || postage.freeOver === undefined ? null : num(postage.freeOver, 0),
      freeWithTuition: typeof postage.freeWithTuition === 'boolean' ? postage.freeWithTuition : d.postage.freeWithTuition,
    },
    shipStates: { pending: name('pending'), shipped: name('shipped'), received: name('received') },
  }
}

export type Product = {
  id: number
  name: string
  category: string
  levelLabel: string | null
  price: number
  imagePath: string | null
  trackStock: boolean
  lowStockAt: number
  isActive: boolean
  sortOrder: number
  stock: number
}

export type StockKind = 'purchase' | 'sale' | 'adjust' | 'return'
export type StockMove = {
  id: number
  productId: number
  qty: number
  kind: StockKind
  note: string | null
  createdBy: number | null
  createdAt: string
}

export const STOCK_KIND_LABELS: Record<StockKind, string> = {
  purchase: 'Bought in',
  sale: 'Sold',
  adjust: 'Adjusted',
  return: 'Returned',
}

// Low stock: kept in stock and at or under its line.
export function isLowStock(p: Pick<Product, 'trackStock' | 'stock' | 'lowStockAt'>): boolean {
  return p.trackStock && p.stock <= p.lowStockAt
}

// A product's form, checked before saving. Null when fine, else the reason.
export type ProductDraft = {
  name: string
  category: string
  levelLabel: string
  price: string
  lowStockAt: string
  trackStock: boolean
  isActive: boolean
  imagePath: string | null
}

export function checkProductDraft(d: ProductDraft, categories: string[]): string | null {
  if (!d.name.trim()) return 'Give the product a name.'
  if (d.name.trim().length > 120) return 'The name is too long (120 characters at most).'
  if (!categories.includes(d.category)) return 'Pick one of the categories.'
  const price = Number(d.price)
  if (d.price.trim() === '' || !Number.isFinite(price) || price < 0 || price > 100000) return 'The price must be an amount from 0.'
  if (Math.round(price * 100) !== price * 100) return 'The price can have at most 2 decimals.'
  const low = Number(d.lowStockAt)
  if (!Number.isInteger(low) || low < 0) return 'The low-stock line must be a whole number from 0.'
  if (d.levelLabel.length > 60) return 'Level / subject is too long (60 characters at most).'
  return null
}

const ringgitFmt = (n: number) => `RM${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const productPrice = (p: Pick<Product, 'price'>) => ringgitFmt(p.price)

// ---- calls ----

const reason = (error: { message?: string; code?: string } | null, fallback: string) =>
  error && isMissingDatabaseThing(error) ? 'Products need their database update first.' : error?.message || fallback

export async function fetchProductsSettings(): Promise<ProductsSettings> {
  if (!supabase) return DEFAULT_PRODUCTS_SETTINGS
  const { data, error } = await supabase.rpc('products_settings')
  return error ? DEFAULT_PRODUCTS_SETTINGS : readProductsSettings(data)
}

export async function saveProductsSettings(value: Partial<ProductsSettings>): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_products_settings', { p_value: value as Json })
  if (!error) window.dispatchEvent(new Event(PRODUCTS_SWITCHED))
  return error ? reason(error, 'Could not save.') : null
}

export async function fetchProducts(): Promise<{ rows: Product[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const [products, stock] = await Promise.all([
    supabase.from('products').select('id, name, category, level_label, price, image_path, track_stock, low_stock_at, is_active, sort_order').order('sort_order').order('id'),
    supabase.from('product_stock').select('product_id, stock'),
  ])
  if (products.error) return { rows: [], error: reason(products.error, 'Could not load the products.') }
  const stockOf = new Map((stock.data ?? []).map((s) => [s.product_id, s.stock]))
  return {
    rows: (products.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      levelLabel: p.level_label,
      price: Number(p.price),
      imagePath: p.image_path,
      trackStock: p.track_stock,
      lowStockAt: p.low_stock_at,
      isActive: p.is_active,
      sortOrder: p.sort_order,
      stock: stockOf.get(p.id) ?? 0,
    })),
    error: null,
  }
}

export async function saveProduct(id: number | null, d: ProductDraft): Promise<{ id: number | null; error: string | null }> {
  if (!supabase) return { id: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('save_product', {
    p_id: id,
    p_name: d.name.trim(),
    p_category: d.category,
    p_level_label: d.levelLabel.trim() || null,
    p_price: Number(d.price),
    p_image_path: d.imagePath,
    p_track_stock: d.trackStock,
    p_low_stock_at: Number(d.lowStockAt),
    p_is_active: d.isActive,
    p_sort_order: null,
  })
  return error ? { id: null, error: reason(error, 'Could not save the product.') } : { id: data as number, error: null }
}

export async function fetchStockMoves(productId: number | null): Promise<StockMove[]> {
  if (!supabase) return []
  let query = supabase.from('product_stock_moves').select('id, product_id, qty, kind, note, created_by, created_at').order('created_at', { ascending: false }).limit(200)
  if (productId !== null) query = query.eq('product_id', productId)
  const { data, error } = await query
  if (error) return []
  return (data ?? []).map((m) => ({ id: m.id, productId: m.product_id, qty: m.qty, kind: m.kind, note: m.note, createdBy: m.created_by, createdAt: m.created_at }))
}

export async function addStockMove(productId: number, kind: 'purchase' | 'adjust' | 'return', qty: number, note: string): Promise<{ stock: number | null; error: string | null }> {
  if (!supabase) return { stock: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('add_stock_move', { p_product_id: productId, p_kind: kind, p_qty: qty, p_note: note.trim() || null })
  return error ? { stock: null, error: reason(error, 'Could not save the stock change.') } : { stock: data as number, error: null }
}

export async function uploadProductImage(file: File): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/jpeg' ? 'jpg' : null
  if (!ext) return { ok: false, error: 'Choose a PNG, JPG or WebP picture.' }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: 'The picture must be 2 MB or smaller.' }
  const path = `p/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('product-images').upload(path, file, { contentType: file.type })
  return error ? { ok: false, error: error.message || 'Could not upload the picture.' } : { ok: true, path }
}

export function productImageUrl(path: string | null): string | null {
  if (!path || !supabase) return null
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

// Whether the school switched Products on; read again when an admin flips it.
export const PRODUCTS_SWITCHED = 'crm:products-switched'

export function useProductsEnabled(signedIn: boolean) {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    if (!signedIn) return
    let alive = true
    const read = () =>
      void fetchProductsSettings().then((s) => {
        if (alive) setEnabled(s.enabled)
      })
    read()
    window.addEventListener(PRODUCTS_SWITCHED, read)
    return () => {
      alive = false
      window.removeEventListener(PRODUCTS_SWITCHED, read)
    }
  }, [signedIn])
  return signedIn && enabled
}
