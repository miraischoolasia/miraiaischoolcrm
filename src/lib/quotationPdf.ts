import { buildPdfFromJpeg } from './receiptPdf'
import type { PublicQuotation } from '../../supabase/functions/_shared/quotation/logic.ts'

// The quotation as a one-page PDF (Plan B, boss 2026-10-23): what the parent's page shows, from the same kept price,
// plus the school's bank account for a bank transfer. Drawn in the browser on a canvas — the phone's or computer's
// own fonts have the Chinese the standard PDF fonts lack — and wrapped with buildPdfFromJpeg. The Inbox and the
// parent's page both draw it from quote-public's answer, so both PDFs are the same.

export type PdfRow =
  | { kind: 'title'; text: string }
  | { kind: 'subtitle'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string; muted?: boolean }
  | { kind: 'money'; label: string; amount: string; strong?: boolean; tone?: 'discount' }
  | { kind: 'rule' }
  | { kind: 'image'; url: string; caption: string }
  | { kind: 'gap' }

const money = (n: number) => `RM${n.toFixed(2)}`

export function quotationPdfRows(q: PublicQuotation): PdfRow[] {
  const rows: PdfRow[] = [
    { kind: 'title', text: q.schoolName },
    { kind: 'subtitle', text: `报价单 ${q.receiptNo}` },
    { kind: 'gap' },
    { kind: 'heading', text: '学生' },
    { kind: 'text', text: q.childName },
    { kind: 'heading', text: '月份' },
    { kind: 'text', text: q.months },
    { kind: 'heading', text: '科目和上课时间' },
    ...q.classes.map((c) => ({ kind: 'text' as const, text: `${c.subject}　${c.classroom}${c.when ? ` · ${c.when}` : ''}` })),
    { kind: 'gap' },
    { kind: 'rule' },
    ...q.lines.map((line) => ({ kind: 'money' as const, label: line.label, amount: money(line.amount) })),
  ]
  if (q.discount) rows.push({ kind: 'money', label: q.discount.label, amount: `-${money(q.discount.amount)}`, tone: 'discount' })
  rows.push({ kind: 'rule' }, { kind: 'money', label: '总数', amount: money(q.total), strong: true })
  if (q.status !== 'paid') rows.push({ kind: 'text', text: `有效期到 ${formatExpiry(q.expiresAt)}`, muted: true })
  if (q.status === 'paid') rows.push({ kind: 'text', text: `已付款 ${money(q.total)}` })
  if (q.paymentRoute === 'bank_transfer' && q.bank && q.status !== 'paid') {
    rows.push(
      { kind: 'gap' },
      { kind: 'heading', text: '银行转账' },
      { kind: 'text', text: `银行：${q.bank.bankName}` },
      { kind: 'text', text: `户口名：${q.bank.accountName}` },
      { kind: 'text', text: `户口号码：${q.bank.accountNumber}` },
      { kind: 'text', text: `金额：${money(q.total)}` },
    )
    if (q.qrUrl) rows.push({ kind: 'image', url: q.qrUrl, caption: '扫码转账' })
    if (q.bankNote) rows.push({ kind: 'text', text: q.bankNote, muted: true })
  }
  if (q.terms) rows.push({ kind: 'gap' }, { kind: 'heading', text: '条款' }, ...q.terms.split('\n').filter(Boolean).map((t) => ({ kind: 'text' as const, text: t, muted: true })))
  return rows
}

export function formatExpiry(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function quotationPdfName(q: PublicQuotation): string {
  return `Quotation ${q.childName} ${q.receiptNo}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ')
}

const WIDTH = 1240
const PAD = 90
const FONT = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", sans-serif'

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const char of text) {
    if (context.measureText(line + char).width > width && line) {
      out.push(line)
      line = char
    } else {
      line += char
    }
  }
  if (line) out.push(line)
  return out
}

// Draws the rows; with no context it only measures how tall the page must be.
const QR_SIZE = 360

function draw(context: CanvasRenderingContext2D, rows: PdfRow[], paint: boolean, images: Map<string, HTMLImageElement> = new Map()): number {
  let y = PAD
  const inner = WIDTH - 2 * PAD
  const text = (value: string, x: number, size: number, weight: number, color: string, align: CanvasTextAlign = 'left') => {
    context.font = `${weight} ${size}px ${FONT}`
    context.fillStyle = color
    context.textAlign = align
    if (paint) context.fillText(value, x, y)
  }
  for (const row of rows) {
    if (row.kind === 'gap') {
      y += 24
    } else if (row.kind === 'rule') {
      if (paint) {
        context.fillStyle = '#e2e8f0'
        context.fillRect(PAD, y, inner, 2)
      }
      y += 28
    } else if (row.kind === 'image') {
      const image = images.get(row.url)
      if (!image) continue
      y += 20
      if (paint) context.drawImage(image, (WIDTH - QR_SIZE) / 2, y, QR_SIZE, QR_SIZE)
      y += QR_SIZE + 34
      text(row.caption, WIDTH / 2, 24, 400, '#64748b', 'center')
      y += 10
    } else if (row.kind === 'title') {
      y += 44
      text(row.text, WIDTH / 2, 48, 700, '#0f172a', 'center')
      y += 24
    } else if (row.kind === 'subtitle') {
      y += 36
      text(row.text, WIDTH / 2, 28, 400, '#64748b', 'center')
      y += 16
    } else if (row.kind === 'heading') {
      y += 34
      text(row.text, PAD, 24, 400, '#64748b')
      y += 10
    } else if (row.kind === 'text') {
      context.font = `400 30px ${FONT}`
      for (const part of wrap(context, row.text, inner)) {
        y += 40
        text(part, PAD, 30, 400, row.muted ? '#64748b' : '#1e293b')
      }
      y += 6
    } else {
      const size = row.strong ? 40 : 28
      context.font = `${row.strong ? 700 : 400} ${size}px ${FONT}`
      const parts = wrap(context, row.label, inner - 260)
      parts.forEach((part, i) => {
        y += size + 12
        text(part, PAD, size, row.strong ? 700 : 400, row.tone === 'discount' ? '#047857' : '#1e293b')
        if (i === 0) text(row.amount, WIDTH - PAD, size, row.strong ? 700 : 600, row.strong ? '#be185d' : row.tone === 'discount' ? '#047857' : '#1e293b', 'right')
      })
      y += 8
    }
  }
  return y + PAD
}

// A picture for the PDF (the school's QR, from its public address); null when it cannot be loaded.
function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

export async function quotationPdf(q: PublicQuotation): Promise<File> {
  const rows = quotationPdfRows(q)
  const images = new Map<string, HTMLImageElement>()
  for (const row of rows) {
    if (row.kind !== 'image') continue
    const image = await loadImage(row.url)
    if (image) images.set(row.url, image)
  }
  const measure = document.createElement('canvas').getContext('2d')
  if (!measure) throw new Error('This browser cannot make the PDF.')
  // At least A4's shape (1240 × 1754), longer when the content is.
  const height = Math.max(1754, Math.ceil(draw(measure, rows, false, images)))
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot make the PDF.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, WIDTH, height)
  context.textBaseline = 'alphabetic'
  draw(context, rows, true, images)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the PDF.'))), 'image/jpeg', 0.85))
  const pdf = buildPdfFromJpeg(new Uint8Array(await blob.arrayBuffer()), WIDTH, height)
  return new File([pdf as BlobPart], quotationPdfName(q), { type: 'application/pdf' })
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}
