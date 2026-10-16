import { afterEach, describe, expect, it, vi } from 'vitest'
import { closeCalendarMorePopover } from './calendarPopover'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('closeCalendarMorePopover', () => {
  it('presses the close button of an open "+more" box', () => {
    document.body.innerHTML =
      '<div class="fc-popover"><span class="fc-popover-close"></span></div>'
    const close = document.querySelector<HTMLElement>('.fc-popover-close')!
    const onClick = vi.fn()
    close.addEventListener('click', onClick)

    closeCalendarMorePopover()

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no box is open', () => {
    expect(() => closeCalendarMorePopover()).not.toThrow()
  })
})
