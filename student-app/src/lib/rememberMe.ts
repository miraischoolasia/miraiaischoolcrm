// "Remember me" on the web sign-in page. Ticked (the default) keeps the
// login as before; left blank, the login ends when the browser is closed:
// a mark in this browser says so, and a cookie with no expiry (gone when the
// browser closes, shared by its tabs) says the browser is still open. Phones
// keep their login as they always did (nothing here runs without a page).

const forgetKey = 'portal.forgetOnClose'
const openCookie = 'portal_open=1'

function hasPage() {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof localStorage !== 'undefined'
}

export function rememberLogin(remember: boolean) {
  if (!hasPage()) return
  try {
    if (remember) {
      localStorage.removeItem(forgetKey)
    } else {
      localStorage.setItem(forgetKey, '1')
      document.cookie = `${openCookie}; path=/; SameSite=Lax`
    }
  } catch {
    // Storage blocked (a private window): the login simply ends with the window.
  }
}

// True when the last login asked to be forgotten and the browser has been closed since.
export function loginShouldEnd() {
  if (!hasPage()) return false
  try {
    return localStorage.getItem(forgetKey) === '1' && !document.cookie.split('; ').includes(openCookie)
  } catch {
    return false
  }
}

export function clearRememberMark() {
  if (!hasPage()) return
  try {
    localStorage.removeItem(forgetKey)
  } catch {
    // nothing to clear
  }
}
