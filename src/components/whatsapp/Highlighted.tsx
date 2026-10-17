import { splitHighlight } from '../../lib/chatSearch'

// A text with the searched words marked, as WhatsApp does in a search.
export function Highlighted({ text, query }: { text: string; query?: string }) {
  if (!query || !query.trim()) {
    return <>{text}</>
  }
  return (
    <>
      {splitHighlight(text, query).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-yellow-200 px-0 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}
