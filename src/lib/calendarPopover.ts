// FullCalendar's "+3 more" box stays open when a card inside it is clicked, and
// floats on over whatever that click opens. Close it, so the class window (or
// anything else) is the only thing left on screen.
export function closeCalendarMorePopover() {
  document
    .querySelectorAll<HTMLElement>('.fc-popover .fc-popover-close')
    .forEach((closeButton) => closeButton.click())
}
