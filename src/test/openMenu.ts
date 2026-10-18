import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Goes to a page from the side menu. Only one group (Marketing, Teaching, Students, Admin) is open at a
// time, so the folded groups are opened one by one until the page shows, then the page is clicked. Waits
// for the menu first, so it can be the first step after signing in.
export async function openMenu(name: string | RegExp) {
  const aside = await waitFor(() => {
    const found = document.querySelector('aside nav')
    if (!found) throw new Error('The side menu is not on the page yet')
    return found as HTMLElement
  })
  const nav = within(aside)
  for (const group of nav.queryAllByRole('button', { expanded: false })) {
    if (nav.queryAllByRole('button', { name }).length > 0) break
    await userEvent.click(group)
  }
  await userEvent.click(nav.getByRole('button', { name }))
  return screen
}
