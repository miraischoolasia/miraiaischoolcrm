import { useCallback, useEffect, useState } from 'react'
import { cn } from '../../lib/cn'
import {
  addStockMove,
  checkProductDraft,
  DEFAULT_PRODUCTS_SETTINGS,
  fetchProducts,
  fetchProductsSettings,
  fetchStockMoves,
  isLowStock,
  productImageUrl,
  productPrice,
  saveProduct,
  saveProductsSettings,
  STOCK_KIND_LABELS,
  uploadProductImage,
  type Product,
  type ProductDraft,
  type ProductsSettings,
  type StockMove,
} from '../../lib/products'

// Products, part 1 (boss 2026-10-23): the books the school sells — the list (picture, price, stock), stock in and out,
// and the settings (on / off, categories, postage per order, shipping state names). Selling on a quotation comes next.

export type ProductsApi = {
  settings: typeof fetchProductsSettings
  saveSettings: typeof saveProductsSettings
  products: typeof fetchProducts
  save: typeof saveProduct
  moves: typeof fetchStockMoves
  addMove: typeof addStockMove
  upload: typeof uploadProductImage
  imageUrl: typeof productImageUrl
}

const databaseApi: ProductsApi = {
  settings: fetchProductsSettings,
  saveSettings: saveProductsSettings,
  products: fetchProducts,
  save: saveProduct,
  moves: fetchStockMoves,
  addMove: addStockMove,
  upload: uploadProductImage,
  imageUrl: productImageUrl,
}

type Tab = 'products' | 'stock' | 'settings'
const input = 'rounded-lg border border-slate-200 px-2 py-1.5 text-sm'

const emptyDraft = (category: string): ProductDraft => ({
  name: '',
  category,
  levelLabel: '',
  price: '',
  lowStockAt: '5',
  trackStock: true,
  isActive: true,
  imagePath: null,
})

const draftOf = (p: Product): ProductDraft => ({
  name: p.name,
  category: p.category,
  levelLabel: p.levelLabel ?? '',
  price: String(p.price),
  lowStockAt: String(p.lowStockAt),
  trackStock: p.trackStock,
  isActive: p.isActive,
  imagePath: p.imagePath,
})

export function ProductsSection({ isAdmin, canEdit, api = databaseApi }: { isAdmin: boolean; canEdit: boolean; api?: ProductsApi }) {
  const [tab, setTab] = useState<Tab>('products')
  const [settings, setSettings] = useState<ProductsSettings>(DEFAULT_PRODUCTS_SETTINGS)
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [s, p] = await Promise.all([api.settings(), api.products()])
    setSettings(s)
    setProducts(p.rows)
    setError(p.error)
    setLoading(false)
  }, [api])

  useEffect(() => {
    void reload()
  }, [reload])

  const tabs: [Tab, string][] = [
    ['products', 'Products'],
    ['stock', 'Stock'],
    ...(isAdmin ? ([['settings', 'Settings']] as [Tab, string][]) : []),
  ]
  const low = products.filter((p) => p.isActive && isLowStock(p))

  return (
    <section aria-labelledby="products-title" className="mx-auto w-full max-w-[1400px] space-y-4">
      <div>
        <h2 id="products-title" className="text-lg font-semibold text-slate-900">
          Products
        </h2>
        <p className="text-sm text-slate-500">The books the school sells: price, picture and stock. Selling them on a quotation comes next.</p>
      </div>

      {!settings.enabled && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Products are switched off for this school{isAdmin ? ' — switch them on in Settings when the list is ready.' : '.'}
        </p>
      )}
      {low.length > 0 && (
        <p role="status" className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">
          Low stock: {low.map((p) => `${p.name} (${p.stock})`).join(', ')}
        </p>
      )}

      <div role="tablist" aria-label="Products" className="flex gap-1 border-b border-slate-200">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
              tab === key ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && tab === 'products' && <ProductList api={api} products={products} settings={settings} canEdit={canEdit} onSaved={reload} />}
      {!loading && tab === 'stock' && <StockTab api={api} products={products} canEdit={canEdit} onSaved={reload} />}
      {!loading && tab === 'settings' && isAdmin && <SettingsTab api={api} settings={settings} onSaved={reload} />}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function ProductList({
  api,
  products,
  settings,
  canEdit,
  onSaved,
}: {
  api: ProductsApi
  products: Product[]
  settings: ProductsSettings
  canEdit: boolean
  onSaved: () => Promise<void>
}) {
  const [editing, setEditing] = useState<{ id: number | null; draft: ProductDraft } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showHidden, setShowHidden] = useState(false)

  const shown = products.filter((p) => showHidden || p.isActive)

  const save = async () => {
    if (!editing) return
    const problem = checkProductDraft(editing.draft, settings.categories)
    if (problem) {
      setMessage(problem)
      return
    }
    setBusy(true)
    const result = await api.save(editing.id, editing.draft)
    setBusy(false)
    if (result.error) {
      setMessage(result.error)
      return
    }
    setEditing(null)
    setMessage(null)
    await onSaved()
  }

  const upload = async (file: File | undefined) => {
    if (!file || !editing) return
    setBusy(true)
    const result = await api.upload(file)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error)
      return
    }
    setEditing({ ...editing, draft: { ...editing.draft, imagePath: result.path } })
  }

  const set = (patch: Partial<ProductDraft>) => editing && setEditing({ ...editing, draft: { ...editing.draft, ...patch } })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              setMessage(null)
              setEditing({ id: null, draft: emptyDraft(settings.categories[0]) })
            }}
            className="rounded-lg bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white"
          >
            + Add a product
          </button>
        )}
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Show hidden products
        </label>
      </div>

      {editing && (
        <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">{editing.id === null ? 'New product' : 'Change product'}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              Name
              <input aria-label="Product name" value={editing.draft.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Category
              <select aria-label="Category" value={editing.draft.category} onChange={(e) => set({ category: e.target.value })} className={input}>
                {settings.categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Level / subject (optional)
              <input aria-label="Level / subject" value={editing.draft.levelLabel} maxLength={60} onChange={(e) => set({ levelLabel: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Price (RM)
              <input aria-label="Price" type="number" min={0} step="0.01" value={editing.draft.price} onChange={(e) => set({ price: e.target.value })} className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Warn when stock is at or under
              <input aria-label="Low stock line" type="number" min={0} value={editing.draft.lowStockAt} onChange={(e) => set({ lowStockAt: e.target.value })} className={input} />
            </label>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.draft.trackStock} onChange={(e) => set({ trackStock: e.target.checked })} /> Keep stock for this product
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={editing.draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Shown (untick to hide; never deleted)
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {editing.draft.imagePath && <img src={api.imageUrl(editing.draft.imagePath) ?? ''} alt="Product picture" className="h-16 w-16 rounded-lg object-cover" />}
            <label className="cursor-pointer font-semibold text-[#fc0c97] hover:underline">
              {editing.draft.imagePath ? 'Change picture' : 'Add a picture'}
              <input aria-label="Picture" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void upload(e.target.files?.[0])} />
            </label>
            {editing.draft.imagePath && (
              <button type="button" onClick={() => set({ imagePath: null })} className="text-red-600 hover:underline">
                Remove picture
              </button>
            )}
          </div>
          {message && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Save product
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </fieldset>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Product</th>
              <th className="px-3 py-2 text-left font-semibold">Category</th>
              <th className="px-3 py-2 text-left font-semibold">Level / subject</th>
              <th className="px-3 py-2 text-right font-semibold">Price</th>
              <th className="px-3 py-2 text-right font-semibold">Stock</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No products yet.
                </td>
              </tr>
            )}
            {shown.map((p) => (
              <tr key={p.id} className={cn('border-t border-slate-100', !p.isActive && 'text-slate-400')}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {p.imagePath ? (
                      <img src={api.imageUrl(p.imagePath) ?? ''} alt="" className="h-10 w-10 rounded object-cover" />
                    ) : (
                      <div aria-hidden className="h-10 w-10 rounded bg-slate-100" />
                    )}
                    <span className="font-semibold">{p.name}</span>
                    {!p.isActive && <span className="rounded bg-slate-100 px-1 text-xs">hidden</span>}
                  </div>
                </td>
                <td className="px-3 py-2">{p.category}</td>
                <td className="px-3 py-2">{p.levelLabel ?? '—'}</td>
                <td className="px-3 py-2 text-right">{productPrice(p)}</td>
                <td className={cn('px-3 py-2 text-right', p.isActive && isLowStock(p) && 'font-semibold text-red-600')}>{p.trackStock ? p.stock : 'not kept'}</td>
                <td className="px-3 py-2 text-right">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setMessage(null)
                        setEditing({ id: p.id, draft: draftOf(p) })
                      }}
                      className="font-semibold text-[#fc0c97] hover:underline"
                    >
                      Change
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function StockTab({ api, products, canEdit, onSaved }: { api: ProductsApi; products: Product[]; canEdit: boolean; onSaved: () => Promise<void> }) {
  const kept = products.filter((p) => p.trackStock)
  const [productId, setProductId] = useState<number | null>(kept[0]?.id ?? null)
  const [kind, setKind] = useState<'purchase' | 'adjust' | 'return'>('purchase')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [moves, setMoves] = useState<StockMove[]>([])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadMoves = useCallback(() => void api.moves(null).then(setMoves), [api])
  useEffect(() => loadMoves(), [loadMoves])

  const save = async () => {
    const n = Number(qty)
    if (productId === null) return
    if (!Number.isInteger(n) || n === 0 || (kind !== 'adjust' && n < 0)) {
      setMessage({ ok: false, text: kind === 'adjust' ? 'Give a whole number (minus to take stock off).' : 'Give a whole number more than 0.' })
      return
    }
    if (kind === 'adjust' && !note.trim()) {
      setMessage({ ok: false, text: 'Say why the stock is adjusted.' })
      return
    }
    const result = await api.addMove(productId, kind, n, note)
    if (result.error) {
      setMessage({ ok: false, text: result.error })
      return
    }
    setMessage({ ok: true, text: `Saved. Stock now ${result.stock}.` })
    setQty('')
    setNote('')
    loadMoves()
    await onSaved()
  }

  const name = (id: number) => products.find((p) => p.id === id)?.name ?? `#${id}`

  return (
    <div className="space-y-4">
      {canEdit && (
        <fieldset className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          <legend className="px-1 font-semibold text-slate-900">Stock in / out</legend>
          <label className="flex flex-col gap-1">
            Product
            <select aria-label="Stock product" value={productId ?? ''} onChange={(e) => setProductId(Number(e.target.value))} className={input}>
              {kept.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (now {p.stock})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            What
            <select aria-label="Stock change" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={input}>
              <option value="purchase">Bought in (+)</option>
              <option value="return">Returned (+)</option>
              <option value="adjust">Adjust (+ or −, with a reason)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            How many
            <input aria-label="How many" type="number" step={1} value={qty} onChange={(e) => setQty(e.target.value)} className={cn(input, 'w-28')} />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            Note {kind === 'adjust' ? '(needed)' : '(optional)'}
            <input aria-label="Stock note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={input} />
          </label>
          <button type="button" disabled={productId === null} onClick={() => void save()} className="rounded-lg bg-[#fc0c97] px-4 py-2 font-semibold text-white disabled:opacity-50">
            Save
          </button>
          {message && <p className={cn('w-full text-sm', message.ok ? 'text-emerald-700' : 'text-red-700')}>{message.text}</p>}
        </fieldset>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">When</th>
              <th className="px-3 py-2 text-left font-semibold">Product</th>
              <th className="px-3 py-2 text-left font-semibold">What</th>
              <th className="px-3 py-2 text-right font-semibold">Change</th>
              <th className="px-3 py-2 text-left font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {moves.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  No stock changes yet.
                </td>
              </tr>
            )}
            {moves.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-600">{new Date(m.createdAt).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                <td className="px-3 py-2">{name(m.productId)}</td>
                <td className="px-3 py-2">{STOCK_KIND_LABELS[m.kind]}</td>
                <td className={cn('px-3 py-2 text-right font-semibold', m.qty > 0 ? 'text-emerald-700' : 'text-red-600')}>
                  {m.qty > 0 ? `+${m.qty}` : m.qty}
                </td>
                <td className="px-3 py-2 text-slate-600">{m.note ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function SettingsTab({ api, settings, onSaved }: { api: ProductsApi; settings: ProductsSettings; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(settings)
  const [categories, setCategories] = useState(settings.categories.join('\n'))
  const [freeOver, setFreeOver] = useState(settings.postage.freeOver === null ? '' : String(settings.postage.freeOver))
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const save = async () => {
    const list = categories
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean)
    const value: ProductsSettings = {
      ...draft,
      categories: list,
      postage: { ...draft.postage, freeOver: freeOver.trim() === '' ? null : Number(freeOver) },
    }
    const error = await api.saveSettings(value)
    setMessage(error ? { ok: false, text: error } : { ok: true, text: 'Settings saved.' })
    if (!error) await onSaved()
  }

  const setPostage = (patch: Partial<ProductsSettings['postage']>) => setDraft((d) => ({ ...d, postage: { ...d.postage, ...patch } }))

  return (
    <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
      <legend className="px-1 font-semibold text-slate-900">Product settings</legend>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
        Products are on for this school (staff with the Products tick see this page)
      </label>
      <label className="flex flex-col gap-1">
        Categories (one per line)
        <textarea aria-label="Categories" rows={4} value={categories} onChange={(e) => setCategories(e.target.value)} className={cn(input, 'max-w-sm')} />
      </label>
      <div className="space-y-2">
        <p className="font-semibold text-slate-900">Postage per order (used when books are sold on a quotation)</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-1">
            West Malaysia RM
            <input aria-label="Postage west" type="number" min={0} step="0.01" value={draft.postage.west} onChange={(e) => setPostage({ west: Number(e.target.value) })} className={cn(input, 'w-24')} />
          </label>
          <label className="flex items-center gap-1">
            East Malaysia RM
            <input aria-label="Postage east" type="number" min={0} step="0.01" value={draft.postage.east} onChange={(e) => setPostage({ east: Number(e.target.value) })} className={cn(input, 'w-24')} />
          </label>
          <label className="flex items-center gap-1">
            Free from RM
            <input aria-label="Free postage from" type="number" min={0} step="0.01" placeholder="never" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} className={cn(input, 'w-24')} />
          </label>
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={draft.postage.freeWithTuition} onChange={(e) => setPostage({ freeWithTuition: e.target.checked })} />
          No book postage when the books go with tuition that already has postage
        </label>
      </div>
      <div className="flex flex-wrap gap-4">
        {(['pending', 'shipped', 'received'] as const).map((key) => (
          <label key={key} className="flex items-center gap-1">
            {key === 'pending' ? 'To ship' : key === 'shipped' ? 'Shipped' : 'Received'}:
            <input
              aria-label={`Shipping state ${key}`}
              value={draft.shipStates[key]}
              maxLength={30}
              onChange={(e) => setDraft((d) => ({ ...d, shipStates: { ...d.shipStates, [key]: e.target.value } }))}
              className={cn(input, 'w-28')}
            />
          </label>
        ))}
      </div>
      <button type="button" onClick={() => void save()} className="rounded-lg bg-[#fc0c97] px-4 py-2 font-semibold text-white">
        Save settings
      </button>
      {message && <p className={cn('text-sm', message.ok ? 'text-emerald-700' : 'text-red-700')}>{message.text}</p>}
    </fieldset>
  )
}
