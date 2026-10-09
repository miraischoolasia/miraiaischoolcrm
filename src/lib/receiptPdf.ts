// A payment receipt is always kept as a PDF. A PDF goes in as it is; a photo or screenshot
// is shrunk and wrapped in a one-page PDF here, in the browser, so no tool is needed.

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
// A phone photo is far sharper than a receipt needs to be.
const LONGEST_SIDE = 1800
const A4 = { width: 595, height: 842, margin: 28 }

const encoder = new TextEncoder()

// A one-page A4 PDF holding one JPEG, scaled to fit with a small margin.
export function buildPdfFromJpeg(jpeg: Uint8Array, width: number, height: number): Uint8Array {
  const room = { width: A4.width - 2 * A4.margin, height: A4.height - 2 * A4.margin }
  const scale = Math.min(room.width / width, room.height / height)
  const drawn = { width: width * scale, height: height * scale }
  const x = (A4.width - drawn.width) / 2
  const y = (A4.height - drawn.height) / 2
  const content = `q ${drawn.width.toFixed(2)} 0 0 ${drawn.height.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`

  const parts: Uint8Array[] = []
  const offsets: number[] = []
  let length = 0
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part
    parts.push(bytes)
    length += bytes.length
  }
  const startObject = (number: number) => {
    offsets[number] = length
    push(`${number} 0 obj\n`)
  }

  push('%PDF-1.4\n')
  startObject(1)
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  startObject(2)
  push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  startObject(3)
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] ` +
      '/Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n',
  )
  startObject(4)
  push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`)
  startObject(5)
  push(
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB ` +
      `/BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  )
  push(jpeg)
  push('\nendstream\nendobj\n')

  const xrefAt = length
  push('xref\n0 6\n0000000000 65535 f \n')
  for (let number = 1; number <= 5; number += 1) {
    push(`${String(offsets[number]).padStart(10, '0')} 00000 n \n`)
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`)

  const out = new Uint8Array(length)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

function fileBase(name: string) {
  return name.replace(/\.[^.]+$/, '') || 'receipt'
}

async function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function toJpeg(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not shrink the photo.'))), 'image/jpeg', quality)
  })
}

// The photo as a small PDF, named after it.
export async function imageToPdf(file: File): Promise<File> {
  const image = await loadImage(file)
  const shrink = Math.min(1, LONGEST_SIDE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * shrink))
  const height = Math.max(1, Math.round(image.height * shrink))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not read the photo.')
  }
  // A screenshot with see-through parts would turn black in a JPEG.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image.source, 0, 0, width, height)

  let blob = await toJpeg(canvas, 0.72)
  if (blob.size > 1_500_000) {
    blob = await toJpeg(canvas, 0.5)
  }
  const pdf = buildPdfFromJpeg(new Uint8Array(await blob.arrayBuffer()), width, height)
  return new File([pdf as BlobPart], `${fileBase(file.name)}.pdf`, { type: 'application/pdf' })
}

export type PreparedReceipt = { file: File; converted: boolean }

// What to store for whatever the team picked: the PDF itself, or the photo as a PDF.
export async function prepareReceipt(file: File): Promise<PreparedReceipt> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  const prepared = isPdf
    ? { file, converted: false }
    : file.type.startsWith('image/')
      ? { file: await imageToPdf(file), converted: true }
      : null
  if (!prepared) {
    throw new Error('Choose a PDF or a photo of the receipt.')
  }
  if (prepared.file.size > MAX_RECEIPT_BYTES) {
    throw new Error('That file is over 10 MB. Choose a smaller one.')
  }
  return prepared
}
