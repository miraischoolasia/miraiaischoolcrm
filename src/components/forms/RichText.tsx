import { Fragment } from 'react'
import {
  parseHeadingInlines,
  parseRichText,
  type RichInline,
} from '../../lib/richText'
import type { FormTextStyle } from '../../types/domain'

function Inlines({ inlines }: { inlines: RichInline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        switch (inline.kind) {
          case 'bold':
            return <strong key={index}>{inline.text}</strong>
          case 'link':
            return (
              <a
                key={index}
                href={inline.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[#be185d] underline underline-offset-2 hover:text-[#9d174d]"
              >
                {inline.text}
              </a>
            )
          case 'break':
            return <br key={index} />
          default:
            return <Fragment key={index}>{inline.text}</Fragment>
        }
      })}
    </>
  )
}

// The written details on a form. Drawn from parsed data, never as raw HTML.
export function RichText({ content, style }: { content: string; style: FormTextStyle }) {
  if (style === 'heading') {
    return (
      <h2 className="font-heading text-xl font-extrabold leading-snug text-slate-900">
        <Inlines inlines={parseHeadingInlines(content)} />
      </h2>
    )
  }

  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      {parseRichText(content).map((block, index) =>
        block.kind === 'list' ? (
          <ul key={index} className="list-disc space-y-1 pl-5 marker:text-[#fc0c97]">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <Inlines inlines={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inlines inlines={block.inlines} />
          </p>
        ),
      )}
    </div>
  )
}
