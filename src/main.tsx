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

  // The school's own name, logo and colours (Class Settings > Brand), before anything is drawn.
  const { startBranding } = await import('./lib/branding.ts')
  await startBranding()

  // /p/<page address>: a published landing page (Marketing > Landing Page), without the CRM; ?preview=1 = the draft.
  const landingSlug = /^\/p\/([^/]+)\/?$/.exec(window.location.pathname)?.[1]
  if (landingSlug) {
    const { PublicLandingPage } = await import('./landing/PublicLandingPage.tsx')
    root.render(
      <StrictMode>
        <PublicLandingPage slug={landingSlug.toLowerCase()} preview={isPreview} />
      </StrictMode>,
    )
    return
  }

  if (publicFormKey) {
    const { PublicFormPage } = await import('./components/PublicFormPage.tsx')
    root.render(
      <StrictMode>
        <PublicFormPage formKey={publicFormKey} preview={isPreview} />
      </StrictMode>,
    )
    return
  }

  // /?quote=<token>: a parent's quotation (no login); &return=1 when Razorpay sends them back after paying.
  const quoteToken = params.get('quote')
  if (quoteToken) {
    const { QuotePage } = await import('./components/quotation/QuotePage.tsx')
    root.render(
      <StrictMode>
        <QuotePage token={quoteToken} returned={params.get('return') === '1'} />
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

  // Dev server only: /?demo=unreadcopy shows the menu badge counting from the inbox copy, with its live changes.
  if (import.meta.env.DEV && params.get('demo') === 'unreadcopy') {
    const { UnreadCopyDemo } = await import('./dev/UnreadCopyDemo.tsx')
    root.render(
      <StrictMode>
        <UnreadCopyDemo />
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

  // Dev server only: /?demo=teamreplies shows Team replies split by channel on made-up days held in the page.
  if (import.meta.env.DEV && params.get('demo') === 'teamreplies') {
    const { TeamRepliesDemo } = await import('./dev/TeamRepliesDemo.tsx')
    root.render(
      <StrictMode>
        <TeamRepliesDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=brand shows Class Settings > Brand beside a piece of the CRM, saving only in the page.
  if (import.meta.env.DEV && params.get('demo') === 'brand') {
    const { BrandDemo } = await import('./dev/BrandDemo.tsx')
    root.render(
      <StrictMode>
        <BrandDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=teams shows My Team > Teams and Working hours on made-up data held in the page.
  if (import.meta.env.DEV && params.get('demo') === 'teams') {
    const { TeamsDemo } = await import('./dev/TeamsDemo.tsx')
    root.render(
      <StrictMode>
        <TeamsDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=lessonlinks shows a weekly lesson's form with its FB group and fixed Zoom link.
  if (import.meta.env.DEV && params.get('demo') === 'lessonlinks') {
    const { LessonLinksDemo } = await import('./dev/LessonLinksDemo.tsx')
    root.render(
      <StrictMode>
        <LessonLinksDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=classes shows My Classroom on made-up classes: roster pages, class categories, new-class steps.
  if (import.meta.env.DEV && params.get('demo') === 'classes') {
    const { ClassroomDemo } = await import('./dev/ClassroomDemo.tsx')
    root.render(
      <StrictMode>
        <ClassroomDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=numbers shows the Inbox's Numbers window with two numbers, each with its own QR code.
  if (import.meta.env.DEV && params.get('demo') === 'numbers') {
    const { NumbersDemo } = await import('./dev/NumbersDemo.tsx')
    root.render(
      <StrictMode>
        <NumbersDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=familychat shows the Inbox side panel of a child's own chat beside the parent's chat.
  if (import.meta.env.DEV && params.get('demo') === 'familychat') {
    const { FamilyChatDemo } = await import('./dev/FamilyChatDemo.tsx')
    root.render(
      <StrictMode>
        <FamilyChatDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=videoaccess shows the recordings access grid and the many-students window on made-up data.
  if (import.meta.env.DEV && params.get('demo') === 'videoaccess') {
    const { VideoAccessDemo } = await import('./dev/VideoAccessDemo.tsx')
    root.render(
      <StrictMode>
        <VideoAccessDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=clash shows the lesson form and the move window stopping a teacher time clash.
  if (import.meta.env.DEV && params.get('demo') === 'clash') {
    const { ClashDemo } = await import('./dev/ClashDemo.tsx')
    root.render(
      <StrictMode>
        <ClashDemo />
      </StrictMode>,
    )
    return
  }

  // Dev server only: /?demo=studentfields shows Class Settings > Student fields, the fields on a student and the list filters.
  if (import.meta.env.DEV && params.get('demo') === 'studentfields') {
    const { StudentFieldsDemo } = await import('./dev/StudentFieldsDemo.tsx')
    root.render(
      <StrictMode>
        <StudentFieldsDemo />
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
