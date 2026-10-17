import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Goes to a page from the side menu: opens every folded group first (a page
// sits inside Marketing, Teaching, Students or Admin), then clicks the page.
export async function openMenu(name: string | RegExp) {
  const nav = within(document.querySelector('aside nav') as HTMLElement)
  for (const group of nav.queryAllByRole('button', { expanded: false })) {
    await userEvent.click(group)
  }
  await userEvent.click(nav.getByRole('button', { name }))
  return screen
}
