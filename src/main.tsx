import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// /?form=<link name or id> is the public, logged-out page of a Marketing
// form. Adding &preview=1 shows the builder's unsaved draft of it instead.
const params = new URLSearchParams(window.location.search)
const publicFormKey = params.get('form')
const isPreview = params.get('preview') === '1'

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
}

void start()
