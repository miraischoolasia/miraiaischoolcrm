import { normalizeLessonLink } from '../lib/scheduleLinks'

type LessonLinkField = 'fbGroupUrl' | 'zoomLink'

const fields: { key: LessonLinkField; label: string; hint: string }[] = [
  { key: 'fbGroupUrl', label: 'FB group link', hint: "This lesson's Facebook group (staff see it here)." },
  {
    key: 'zoomLink',
    label: 'Fixed Zoom link',
    hint: 'Used when no Zoom meeting is made for the day: the teacher console and the student app open it.',
  },
]

// The weekly lesson's own FB group and fixed Zoom link, with a way to open
// each one that is a real link.
export function LessonLinkFields({
  fbGroupUrl,
  zoomLink,
  onChange,
}: {
  fbGroupUrl: string
  zoomLink: string
  onChange: (field: LessonLinkField, value: string) => void
}) {
  const values = { fbGroupUrl, zoomLink }
  return (
    <>
      {fields.map((field) => {
        const { link, error } = normalizeLessonLink(values[field.key])
        return (
          <label key={field.key} className="space-y-2 sm:col-span-2">
            <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
              {field.label}
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-sky-700 underline underline-offset-2"
                >
                  Open
                </a>
              )}
            </span>
            <input
              type="text"
              inputMode="url"
              value={values[field.key]}
              placeholder="https://"
              onChange={(event) => onChange(field.key, event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
            />
            <span className={`block text-xs ${error ? 'text-red-700' : 'text-slate-500'}`}>
              {error ? `This ${error}.` : field.hint}
            </span>
          </label>
        )
      })}
    </>
  )
}
