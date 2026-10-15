import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { brand } from './lib/brand'

// /?form=<link name or id> is the public, logged-out page of a Marketing
// form. Adding &preview=1 shows the builder's unsaved draft of it instead.
// The tab title is the brand's name (index.html holds Mirai's as the fallback).
document.title = brand.name

const params = new URLSearchParams(window.location.search)
const publicFormKey = params.get('form')
const isPreview = params.get('preview') === '1'

// After a new deployment a tab that was already open can ask for a file that no longer exists, and would
// stay on "Loading..." for good. Reload once to get the new page; a second failure says so instead.
const RELOADED_KEY = 'crm-reloaded-for-new-version'

function reloadForNewVersion() {
  try {
    if (window.sessionStorage.getItem(RELOADED_KEY) === 'yes') {
      return false
    }
    window.sessionStorage.setItem(RELOADED_KEY, 'yes')
  } catch {
    return false
  }
  window.location.reload()
  return true
}

function showLoadProblem() {
  const note = document.querySelector('#root p')
  if (note) {
    note.textContent = 'The page could not load. Please refresh (Ctrl+Shift+R), or check the internet connection.'
  }
}

window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  if (!reloadForNewVersion()) {
    showLoadProblem()
  }
})

// Each side is loaded on its own, so a parent opening a form does not first
// download the whole CRM (calendar, charts and all) just to see one page.
async function start() {
  const root = createRoot(document.getElementById('root')!)

  if (publicFormKey) {
    const { PublicFormPage } = await import('./components/PublicFormPage.tsx')
    root.render(
      <StrictMode>
        <PublicFormPage formKey={publicFormKey} preview={isPreview} />
      </StrictMode>,
    )
    return
  }

  const { default: App } = await import('./App.tsx')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  try {
    window.sessionStorage.removeItem(RELOADED_KEY)
  } catch {
    // Nothing to clean up without storage.
  }
}

start().catch(() => {
  if (!reloadForNewVersion()) {
    showLoadProblem()
  }
})
