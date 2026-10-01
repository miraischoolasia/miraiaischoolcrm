import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PublicFormPage } from './components/PublicFormPage.tsx'

// /?form=<id> is the public, logged-out page of a Marketing form.
const publicFormId = new URLSearchParams(window.location.search).get('form')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{publicFormId ? <PublicFormPage formKey={publicFormId} /> : <App />}</StrictMode>,
)
