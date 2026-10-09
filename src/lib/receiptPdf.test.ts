import { describe, expect, it } from 'vitest'
import { buildPdfFromJpeg, prepareReceipt } from './receiptPdf'

const text = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

describe('buildPdfFromJpeg', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9])
  const pdf = buildPdfFromJpeg(jpeg, 1000, 2000)
  const body = text(pdf)

  it('makes a one-page PDF that holds the photo as it is', () => {
    expect(body.startsWith('%PDF-1.4')).toBe(true)
    expect(body.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(body).toContain('/Filter /DCTDecode')
    expect(body).toContain('/Width 1000 /Height 2000')
    expect(body).toContain(`/Length ${jpeg.length}`)
    expect(body).toContain('/Count 1')
  })

  it('points the table of contents at the right places', () => {
    const startxref = Number(/startxref\n(\d+)/.exec(body)![1])
    expect(body.slice(startxref, startxref + 4)).toBe('xref')
    const entries = [...body.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((match) => Number(match[1]))
    expect(entries).toHaveLength(5)
    entries.forEach((offset, index) => {
      expect(body.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`)
    })
  })

  it('fits a tall photo inside the page', () => {
    // 1000x2000 into 539x786: the height limits it, so it is 393 wide.
    const draw = /q ([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/.exec(body)!
    expect(Number(draw[1])).toBeCloseTo(393, 0)
    expect(Number(draw[2])).toBeCloseTo(786, 0)
    expect(Number(draw[3])).toBeGreaterThan(0)
  })
})

describe('prepareReceipt', () => {
  it('keeps a PDF as it is', async () => {
    const file = new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' })
    const prepared = await prepareReceipt(file)

    expect(prepared.file).toBe(file)
    expect(prepared.converted).toBe(false)
  })

  it('turns away a file that is neither a PDF nor a photo', async () => {
    await expect(prepareReceipt(new File(['x'], 'slip.docx', { type: 'application/msword' }))).rejects.toThrow(
      'Choose a PDF or a photo',
    )
  })

  it('turns away a PDF over 10 MB', async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'slip.pdf', { type: 'application/pdf' })
    await expect(prepareReceipt(big)).rejects.toThrow('over 10 MB')
  })
})
