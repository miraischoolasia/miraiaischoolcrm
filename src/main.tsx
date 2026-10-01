import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PublicFormPage } from './components/PublicFormPage.tsx'

// /?form=<link name or id> is the public, logged-out page of a Marketing
// form. Adding &preview=1 shows the builder's unsaved draft of it instead.
const params = new URLSearchParams(window.location.search)
const publicFormKey = params.get('form')
const isPreview = params.get('preview') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {publicFormKey ? <PublicFormPage formKey={publicFormKey} preview={isPreview} /> : <App />}
  </StrictMode>,
)
