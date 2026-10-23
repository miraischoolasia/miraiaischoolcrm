import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { applyBranding, emptyBranding } from '../lib/branding'
import { LandingRender } from './LandingRender'
import { landingTemplates } from './templates'

const course = () => landingTemplates.find((template) => template.key === 'course')!.data()

describe('LandingRender (the public page, without the editor)', () => {
  afterEach(() => applyBranding(emptyBranding))

  it('draws the course template: title, the text inside both columns, the questions', () => {
    applyBranding({ ...emptyBranding, whatsapp: '60123456789' })
    render(<LandingRender data={course()} />)
    expect(screen.getByRole('heading', { level: 1, name: '让孩子爱上学习' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '适合几岁' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '上课方式' })).toBeInTheDocument()
    expect(screen.getByText('可以先试上一堂吗？')).toBeInTheDocument()
  })

  it('opens WhatsApp to the school\'s number with the message filled in', () => {
    applyBranding({ ...emptyBranding, whatsapp: '+60 12-345 6789' })
    render(<LandingRender data={course()} />)
    const hero = screen.getAllByRole('link', { name: 'WhatsApp 报名' })[0]
    expect(hero).toHaveAttribute('href', `https://wa.me/60123456789?text=${encodeURIComponent('你好，我想报名课程。')}`)
    // The floating button (page settings: on).
    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', expect.stringContaining('wa.me/60123456789'))
  })

  it('leaves WhatsApp buttons out when the school has no number (no note for parents)', () => {
    render(<LandingRender data={course()} />)
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('skips a block it does not know instead of breaking the page', () => {
    render(
      <LandingRender
        data={{ root: { props: {} }, content: [{ type: 'FromTheFuture', props: {} }, { type: 'Faq', props: { id: 'f', title: 'Q', items: [] } }] }}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Q' })).toBeInTheDocument()
  })

  it('keeps a script in rich text from running', () => {
    const { container } = render(
      <LandingRender data={{ root: { props: {} }, content: [{ type: 'Text', props: { id: 't', text: '<p>Hi</p><script>window.x=1</script>' } }] }} />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(within(container).getByText('Hi')).toBeInTheDocument()
  })
})
