import { useLayoutEffect, type RefObject } from 'react'

// Makes a text box as tall as what is written in it, like WhatsApp, up to a number of lines;
// past that it stays that tall and scrolls.
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, maxLines = 8) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const style = window.getComputedStyle(element)
    const lineHeight = Number.parseFloat(style.lineHeight) || 20
    const padding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
    const border = (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.borderBottomWidth) || 0)
    const limit = lineHeight * maxLines + padding + border
    element.style.height = 'auto'
    const wanted = element.scrollHeight + border
    element.style.height = `${Math.min(wanted, limit)}px`
    element.style.overflowY = wanted > limit ? 'auto' : 'hidden'
  }, [ref, value, maxLines])
}
