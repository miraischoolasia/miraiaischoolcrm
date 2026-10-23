import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Goes to a page from the menu. The side menu lists Today and the categories (Marketing, Media, My Course,
// Students, Admin); a category's pages are the tabs at the top of the page. A name in the side menu is clicked
// there; any other name is looked for in each category's tabs, one category after another. Waits for the menu
// first, so it can be the first step after signing in.
export async function openMenu(name: string | RegExp) {
  const aside = await waitFor(() => {
    const found = document.querySelector('aside nav')
    if (!found) throw new Error('The side menu is not on the page yet')
    return found as HTMLElement
  })
  const nav = within(aside)
  const inSide = nav.queryAllByRole('button', { name })
  if (inSide.length > 0) {
    await userEvent.click(inSide[0])
    return screen
  }
  const tabs = () => document.querySelector('nav[aria-label$=" pages"]') as HTMLElement | null
  // The page may already be a tab of the open category; else each category is tried (not Today, a page itself).
  const shown = tabs()
  const already = shown ? within(shown).queryAllByRole('button', { name })[0] : undefined
  if (already) {
    await userEvent.click(already)
    return screen
  }
  for (const category of nav.getAllByRole('button').filter((button) => button.textContent?.trim() !== 'Today')) {
    await userEvent.click(category)
    const bar = tabs()
    const tab = bar ? within(bar).queryAllByRole('button', { name })[0] : undefined
    if (tab) {
      await userEvent.click(tab)
      return screen
    }
  }
  throw new Error(`No page called ${String(name)} in the menu`)
}
