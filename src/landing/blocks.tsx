import type { CSSProperties, ReactNode } from 'react'
import { ArrowRight, WhatsappLogo } from '@phosphor-icons/react'
import { brandWhatsapp } from '../lib/branding'
import { cn } from '../lib/cn'
import { sanitizeHtml } from './sanitizeHtml'

// The blocks of a landing page, as plain React: the editor (Puck) and the public page draw the same ones. Colours
// are written as Mirai's pinks (bg-[#fc0c97] ...), which the build turns into the school's own brand colours.

export type ButtonAction = 'whatsapp' | 'link'

export type PageButton = {
  label: string
  action: ButtonAction
  link?: string
  message?: string
}

// wa.me needs digits only; '' when the school has no number (the button is then left out on the public page).
export function whatsappHref(number: string | undefined, message: string | undefined) {
  const digits = (number || brandWhatsapp()).replace(/\D/g, '')
  if (!digits) {
    return ''
  }
  const text = (message ?? '').trim()
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

function safeLink(link: string | undefined) {
  const value = (link ?? '').trim()
  return /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(value) ? value : ''
}

// Shown only in the editor, where a block is missing something it needs.
export function EditorNote({ children }: { children: ReactNode }) {
  return (
    <p role="note" className="rounded-xl border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
      {children}
    </p>
  )
}

export const NO_WHATSAPP_NOTE = '还没有设定学校的 WhatsApp 号码：请到 Class Settings → Brand 填「Public WhatsApp number」，或在这个按钮填号码。按钮在公开页不会显示。'

export function PageButtonLink({
  button,
  tone,
  editing,
}: {
  button: PageButton
  // 'brand' = a coloured button on a white or pale background; 'light' = a white button on the brand colour.
  tone: 'brand' | 'light' | 'outline'
  editing: boolean
}) {
  const href = button.action === 'whatsapp' ? whatsappHref(undefined, button.message) : safeLink(button.link)
  if (!button.label.trim()) {
    return null
  }
  if (!href) {
    return editing ? (
      <EditorNote>{button.action === 'whatsapp' ? NO_WHATSAPP_NOTE : `「${button.label}」还没有连结。`}</EditorNote>
    ) : null
  }
  const external = /^https?:/i.test(href)
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className={cn(
        'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2',
        tone === 'brand' && 'bg-[#fc0c97] text-white shadow-sm hover:bg-[#de0a84] focus-visible:outline-[#fc0c97]',
        tone === 'light' && 'bg-white text-[#be185d] shadow-sm hover:bg-[#fff1f8] focus-visible:outline-white',
        tone === 'outline' && 'border-2 border-current bg-transparent hover:bg-white/10 focus-visible:outline-current',
      )}
    >
      {button.action === 'whatsapp' ? <WhatsappLogo size={20} weight="fill" aria-hidden="true" /> : null}
      {button.label}
      {button.action === 'link' ? <ArrowRight size={18} weight="bold" aria-hidden="true" /> : null}
    </a>
  )
}

function Section({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <section className={cn('px-5 py-12 md:py-16', className)} style={style}>
      <div className="mx-auto max-w-5xl">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Hero

export type HeroProps = {
  title: string
  subtitle: string
  image: string
  background: 'brand' | 'light' | 'image'
  align: 'left' | 'center'
  buttons: PageButton[]
}

export function HeroBlock({ title, subtitle, image, background, align, buttons, editing }: HeroProps & { editing: boolean }) {
  const onImage = background === 'image' && Boolean(image)
  const sideImage = !onImage && Boolean(image)
  const dark = background === 'brand' || onImage
  return (
    <section
      className={cn(
        'relative overflow-hidden px-5 py-16 md:py-24',
        background === 'brand' && 'bg-[#fc0c97] text-white',
        background === 'light' && 'bg-[#fff1f8] text-slate-900',
        background === 'image' && !onImage && 'bg-slate-900 text-white',
        onImage && 'bg-slate-900 bg-cover bg-center text-white',
      )}
      style={onImage ? { backgroundImage: `linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url("${image}")` } : undefined}
    >
      <div className={cn('mx-auto grid max-w-5xl items-center gap-10', sideImage && 'md:grid-cols-2')}>
        <div className={cn('space-y-5', align === 'center' && !sideImage && 'mx-auto max-w-3xl text-center')}>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-balance md:text-5xl">{title}</h1>
          {subtitle.trim() && <p className={cn('text-lg leading-relaxed md:text-xl', dark ? 'text-white/90' : 'text-slate-600')}>{subtitle}</p>}
          {buttons.length > 0 && (
            <div className={cn('flex flex-wrap gap-3 pt-2', align === 'center' && !sideImage && 'justify-center')}>
              {buttons.slice(0, 2).map((button, index) => (
                <PageButtonLink
                  key={index}
                  button={button}
                  tone={index === 0 ? (dark ? 'light' : 'brand') : 'outline'}
                  editing={editing}
                />
              ))}
            </div>
          )}
        </div>
        {sideImage && (
          <img src={image} alt="" width={800} height={600} className="aspect-[4/3] w-full rounded-3xl object-cover shadow-lg" />
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Text

export type TextProps = {
  text: ReactNode
  align: 'left' | 'center'
  width: 'narrow' | 'wide'
}

export function TextBlock({ text, align, width }: TextProps) {
  return (
    <Section className="py-8 md:py-10">
      <div
        className={cn(
          // Rich text has no styles of its own (the page's reset removes them): lists, headings, links, quotes.
          'text-lg leading-relaxed text-slate-700 [&_a]:font-semibold [&_a]:text-[#be185d] [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-[#fbcfe8] [&_blockquote]:pl-4 [&_blockquote]:italic [&_h1]:mb-3 [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900 [&_hr]:my-6 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_ul]:list-disc [&_ul]:pl-6',
          width === 'narrow' && 'mx-auto max-w-2xl',
          align === 'center' && 'text-center',
        )}
      >
        {typeof text === 'string' ? <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} /> : text}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Image

export type ImageProps = {
  src: string
  alt: string
  caption: string
  width: 'small' | 'medium' | 'full'
  rounded: 'yes' | 'no'
}

export function ImageBlock({ src, alt, caption, width, rounded, editing }: ImageProps & { editing: boolean }) {
  if (!src) {
    return editing ? (
      <Section className="py-6">
        <EditorNote>请在右边上传一张图片。</EditorNote>
      </Section>
    ) : null
  }
  return (
    <Section className="py-6 md:py-8">
      <figure className={cn('mx-auto space-y-2', width === 'small' && 'max-w-md', width === 'medium' && 'max-w-3xl')}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn('h-auto w-full object-cover', rounded === 'yes' && 'rounded-3xl')}
        />
        {caption.trim() && <figcaption className="text-center text-sm text-slate-500">{caption}</figcaption>}
      </figure>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Columns (each column holds blocks of its own; on a phone they stack)

export type ColumnsLayout = '1-1' | '2-1' | '1-2' | '1-1-1'

export const columnsGrid: Record<ColumnsLayout, string> = {
  '1-1': 'md:grid-cols-2',
  '2-1': 'md:grid-cols-[2fr_1fr]',
  '1-2': 'md:grid-cols-[1fr_2fr]',
  '1-1-1': 'md:grid-cols-3',
}

export function ColumnsBlock({
  layout,
  gap,
  columns,
}: {
  layout: ColumnsLayout
  gap: 'small' | 'large'
  columns: ReactNode[]
}) {
  return (
    <section className="px-5 py-6">
      {/* A block inside a column already sits in this box: its own page margins would double up. */}
      <div
        className={cn(
          'mx-auto grid max-w-5xl grid-cols-1 [&_section]:px-0 [&_section]:py-3',
          gap === 'large' ? 'gap-10' : 'gap-5',
          columnsGrid[layout],
        )}
      >
        {columns.map((column, index) => (
          <div key={index} className="min-w-0">
            {column}
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// FAQ

export type FaqProps = {
  title: string
  items: { question: string; answer: string }[]
}

export function FaqBlock({ title, items, editing }: FaqProps & { editing: boolean }) {
  const shown = items.filter((item) => item.question.trim())
  return (
    <Section>
      <div className="mx-auto max-w-3xl space-y-6">
        {title.trim() && <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">{title}</h2>}
        {shown.length === 0 && editing && <EditorNote>请在右边加问题和答案。</EditorNote>}
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {shown.map((item, index) => (
            <details key={index} className="group px-5 py-4" open={editing && index === 0}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fff1f8] text-lg leading-none text-[#be185d] transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="whitespace-pre-line pt-2 text-base leading-relaxed text-slate-600">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Call to action

export type CtaProps = {
  title: string
  text: string
  tone: 'brand' | 'light'
  button: PageButton
}

export function CtaBlock({ title, text, tone, button, editing }: CtaProps & { editing: boolean }) {
  return (
    <section className="px-5 py-10 md:py-14">
      <div
        className={cn(
          'mx-auto max-w-4xl space-y-4 rounded-3xl px-6 py-10 text-center md:px-12',
          tone === 'brand' ? 'bg-[#fc0c97] text-white' : 'bg-[#fff1f8] text-slate-900',
        )}
      >
        <h2 className="text-2xl font-bold tracking-tight text-balance md:text-3xl">{title}</h2>
        {text.trim() && <p className={cn('text-lg', tone === 'brand' ? 'text-white/90' : 'text-slate-600')}>{text}</p>}
        <div className="flex justify-center pt-2">
          <PageButtonLink button={button} tone={tone === 'brand' ? 'light' : 'brand'} editing={editing} />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------
// WhatsApp button

export type WhatsappProps = {
  label: string
  number: string
  message: string
  align: 'left' | 'center'
}

export function WhatsappBlock({ label, number, message, align, editing }: WhatsappProps & { editing: boolean }) {
  const href = whatsappHref(number, message)
  return (
    <section className="px-5 py-6">
      <div className={cn('mx-auto flex max-w-5xl', align === 'center' && 'justify-center')}>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#25d366] px-6 text-base font-semibold text-white shadow-sm transition hover:bg-[#1ebe5b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25d366]"
          >
            <WhatsappLogo size={22} weight="fill" aria-hidden="true" />
            {label || 'WhatsApp'}
          </a>
        ) : (
          editing && <EditorNote>{NO_WHATSAPP_NOTE}</EditorNote>
        )}
      </div>
    </section>
  )
}

// The round WhatsApp button in the bottom right corner (page settings).
export function FloatingWhatsapp({ message, editing }: { message: string; editing: boolean }) {
  const href = whatsappHref(undefined, message)
  if (!href) {
    return editing ? (
      <div className="fixed right-4 bottom-4 z-20 max-w-xs">
        <EditorNote>{NO_WHATSAPP_NOTE}</EditorNote>
      </div>
    ) : null
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp"
      className="fixed right-4 bottom-4 z-20 grid h-14 w-14 place-items-center rounded-full bg-[#25d366] text-white shadow-lg transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25d366]"
    >
      <WhatsappLogo size={30} weight="fill" aria-hidden="true" />
    </a>
  )
}

// ---------------------------------------------------------------------------------------------------------
// Space and line

export function SpacerBlock({ size }: { size: 'small' | 'medium' | 'large' }) {
  return <div aria-hidden="true" className={cn(size === 'small' && 'h-6', size === 'medium' && 'h-12', size === 'large' && 'h-24')} />
}

export function DividerBlock() {
  return (
    <div className="px-5">
      <hr className="mx-auto max-w-5xl border-slate-200" />
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------
// The page around the blocks

export function LandingShell({
  children,
  background,
  floatingWhatsapp,
  floatingMessage,
  editing,
  brandStyle,
}: {
  children: ReactNode
  background: 'white' | 'soft'
  floatingWhatsapp: 'on' | 'off'
  floatingMessage: string
  editing: boolean
  brandStyle?: CSSProperties
}) {
  return (
    <div className={cn('min-h-full text-slate-900', background === 'soft' ? 'bg-slate-50' : 'bg-white')} style={brandStyle}>
      {children}
      {floatingWhatsapp === 'on' && <FloatingWhatsapp message={floatingMessage} editing={editing} />}
    </div>
  )
}

// The school's colours as set on this page's <html> (Class Settings > Brand), copied onto the page box so the
// editor's preview frame shows them too.
export function hostBrandStyle(): CSSProperties {
  if (typeof document === 'undefined') {
    return {}
  }
  const style = document.documentElement.style
  const out: Record<string, string> = {}
  for (let index = 0; index < style.length; index += 1) {
    const name = style.item(index)
    if (name.startsWith('--')) {
      out[name] = style.getPropertyValue(name)
    }
  }
  return out as CSSProperties
}
