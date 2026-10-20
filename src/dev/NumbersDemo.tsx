import { NumbersDialog } from '../components/whatsapp/NumbersDialog'

// Only the dev server shows this (/?demo=numbers): the Inbox's Numbers window for a school with two WhatsApp numbers,
// each linked by its own QR code, on made-up data. The gateway is answered here (a made-up QR picture); nothing is
// sent anywhere and nothing is saved.

const GATEWAY = 'https://gateway.demo.invalid'
const QR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAAAAADhZOFXAAAAH0lEQVR4nGP4z8DwHwj/MzAwMjD8Z2BgYGBg+M8AAKvvB/m5c1RqAAAAAElFTkSuQmCC'

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (!url.startsWith(GATEWAY)) {
    return realFetch(input, init)
  }
  const instance = new URL(url).searchParams.get('instance')
  if (url.includes('/wa/numbers')) {
    const method = init?.method ?? 'GET'
    const body =
      method === 'GET'
        ? [
            { instance: 'school-1', inboxId: 3, label: 'Main', state: 'open', active: true },
            { instance: 'school-2', inboxId: 6, label: 'Second', state: 'close', active: true },
            { instance: 'school-4', inboxId: 8, label: 'Old branch', state: 'close', active: true },
          ]
        : url.endsWith('/wa/numbers')
          ? { id: 9, instance: 'school-3', inboxId: 7 }
          : { ok: true }
    return new Response(JSON.stringify(body), { status: method === 'POST' && url.endsWith('/wa/numbers') ? 201 : 200 })
  }
  const body = url.includes('/wa/connect/qr')
    ? { base64: QR, count: 1, code: `code-${instance}` }
    : { instance: { instanceName: instance, state: instance === 'school-1' ? 'open' : 'close' } }
  return new Response(JSON.stringify(body), { status: 200 })
}

const numbers = [
  { id: 1, label: 'Main', phone: '60120000001', inboxId: 3, instance: 'school-1', isActive: true },
  { id: 2, label: 'Second', phone: null, inboxId: 6, instance: 'school-2', isActive: true },
  { id: 3, label: 'Third (no name yet)', phone: null, inboxId: 7, instance: null, isActive: true },
]

// &staff=40 adds that many made-up staff, to see a long list of ticks (the window must scroll, its buttons stay in view).
const extraStaff = Array.from({ length: Math.min(200, Number(new URLSearchParams(window.location.search).get('staff')) || 0) }, (_, index) => ({
  id: 100 + index,
  name: `Staff member ${index + 1}`,
}))

export function NumbersDemo() {
  return (
    <NumbersDialog
      numbers={numbers}
      assignments={new Map([[1, [7]], [2, [8]]])}
      staff={[
        { id: 7, name: 'Amy' },
        { id: 8, name: 'Ben' },
        ...extraStaff,
      ]}
      inboxes={[
        { id: 3, name: 'School WhatsApp' },
        { id: 6, name: 'School WhatsApp 2' },
        { id: 7, name: 'School WhatsApp 3' },
      ]}
      onSave={async () => 'Demo only: nothing is saved.'}
      onRemove={async () => 'Demo only: nothing is removed.'}
      onClose={() => undefined}
      apiUrl={GATEWAY}
    />
  )
}
