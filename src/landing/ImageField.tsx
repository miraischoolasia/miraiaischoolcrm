import { useId, useState } from 'react'
import { ImageSquare, Trash, UploadSimple } from '@phosphor-icons/react'
import { supabase } from '../lib/supabase'

// The picture field of the landing page editor: pick a picture, it is made smaller in the browser (at most 1920
// wide, WebP) and stored in the public landing-images bucket; the field keeps its address.

const BUCKET = 'landing-images'
const MAX_BYTES = 5 * 1024 * 1024
const MAX_WIDTH = 1920
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// A GIF keeps moving only as it is; anything else is redrawn smaller as WebP.
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') {
    return file
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  if (scale === 1 && file.type === 'image/webp') {
    bitmap.close()
    return file
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85))
  return blob && blob.size < file.size ? blob : file
}

export async function uploadLandingImage(file: File) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  if (!TYPES.includes(file.type)) {
    throw new Error('请选 PNG、JPG、WebP 或 GIF 图片。')
  }
  const blob = await shrinkImage(file)
  if (blob.size > MAX_BYTES) {
    throw new Error('图片超过 5 MB，请选小一点的。')
  }
  const type = blob.type || file.type
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[type] ?? 'webp'
  const path = `${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000' })
  if (error) {
    throw new Error(error.message)
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export function ImageField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  readOnly?: boolean
}) {
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) {
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      onChange(await uploadLandingImage(file))
    } catch (error) {
      setProblem(error instanceof Error ? error.message : '上传失败，请再试一次。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      {value ? (
        <img src={value} alt="" className="aspect-video w-full rounded-lg border border-slate-200 object-cover" />
      ) : (
        <div className="grid aspect-video w-full place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400">
          <ImageSquare size={32} aria-hidden="true" />
        </div>
      )}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <label
            htmlFor={inputId}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <UploadSimple size={16} aria-hidden="true" />
            {busy ? '上传中…' : value ? '换一张' : '上传图片'}
          </label>
          <input
            id={inputId}
            type="file"
            accept={TYPES.join(',')}
            className="sr-only"
            disabled={busy}
            onChange={(event) => {
              void pick(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Trash size={16} aria-hidden="true" />
              拿掉
            </button>
          )}
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-red-600">
          {problem}
        </p>
      )}
    </div>
  )
}
