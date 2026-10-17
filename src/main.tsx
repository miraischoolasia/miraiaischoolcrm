import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { brand } from './lib/brand'

// /?form=<link name or id> is the public, logged-out page of a Marketing
// form. Adding &preview=1 shows the builder's unsaved draft of it instead.
// The tab title is the brand's name (index.html holds Mirai's as the fallback).
document.title = brand.name
// index.html carries Mirai's tab icon; another brand shows its own, or none.
if (brand.usesMiraiArt === false) {
  document.querySelectorAll('link[rel="icon"]').forEach((link) => link.remove())
  if (brand.favicon) {
    const icon = document.createElement('link')
    icon.rel = 'icon'
    icon.href = brand.favicon
    document.head.appendChild(icon)
  }
}

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

  // /?screen=<timetable entry>&date=<day>: the class screen the teacher shares in Zoom (fed by the live class console).
  const screenSchedule = Number(params.get('screen'))
  const screenDate = params.get('date') ?? ''
  if (Number.isInteger(screenSchedule) && screenSchedule > 0 && /^\d{4}-\d{2}-\d{2}$/.test(screenDate)) {
    const { ClassScreen } = await import('./components/ClassScreen.tsx')
    root.render(
      <StrictMode>
        <ClassScreen scheduleId={screenSchedule} lessonDate={screenDate} />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=zoomstep shows the Zoom step with made-up times, without logging in.
  if (import.meta.env.DEV && params.get('demo') === 'zoomstep') {
    const { ZoomStepDemo } = await import('./dev/ZoomStepDemo.tsx')
    root.render(
      <StrictMode>
        <ZoomStepDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=bigclass shows the live class grid with 200 made-up children.
  if (import.meta.env.DEV && params.get('demo') === 'bigclass') {
    const { BigClassDemo } = await import('./dev/BigClassDemo.tsx')
    root.render(
      <StrictMode>
        <BigClassDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=programmes shows the Programmes page on made-up programmes held in the page.
  if (import.meta.env.DEV && params.get('demo') === 'programmes') {
    const { ProgrammesDemo } = await import('./dev/ProgrammesDemo.tsx')
    root.render(
      <StrictMode>
        <ProgrammesDemo />
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
