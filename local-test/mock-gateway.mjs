// A tiny FAKE of the Chatwoot gateway for the local test environment (port 3999).
// It answers the Inbox page's calls from the CRM's own copy (inbox_chats / inbox_messages) in the local database,
// so opening a chat, reading it, marking it read/unread, marking it Done and "sending" all work on fake data.
// Nothing leaves this computer: a "sent" message is only written into the local copy. WhatsApp itself (QR code,
// delivery ticks, the phone's read receipts) does not exist here: /wa/... calls just say ok.
//   node local-test/mock-gateway.mjs        (run.mjs starts it together with the CRM)
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const accounts = JSON.parse(readFileSync(join(here, 'test-accounts.json'), 'utf8'))
const PORT = Number(process.env.LT_GATEWAY_PORT ?? 3999)
accounts.apiUrl = process.env.LT_API_URL ?? accounts.apiUrl

async function db(path, init = {}) {
  const response = await fetch(`${accounts.apiUrl}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: accounts.serviceKey, Authorization: `Bearer ${accounts.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...init.headers },
  })
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
}
const send = (res, status, body) => {
  res.writeHead(status, { ...cors, 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body ?? {}))
}
const readBody = (req) => new Promise((resolve) => { let data = ''; req.on('data', (c) => (data += c)); req.on('end', () => resolve(data)) })

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204)
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname.replace(/^.*\/api\/v1\/accounts\/\d+/, '')
  try {
    if (url.pathname.startsWith('/wa')) return send(res, 200, { ok: true, status: 'open', instances: [] })

    if (req.method === 'GET' && path === '/conversations') {
      const status = url.searchParams.get('status') ?? 'open'
      const filter = status === 'all' ? '' : `&status=eq.${status}`
      const chats = (await db(`inbox_chats?select=raw,last_message_raw&order=last_activity_at.desc${filter}`)) ?? []
      const payload = chats.map((c) => ({ ...c.raw, last_non_activity_message: c.last_message_raw }))
      return send(res, 200, { data: { payload, meta: { all_count: payload.length } } })
    }
    if (req.method === 'GET' && path === '/conversations/search') {
      const q = encodeURIComponent(`*${url.searchParams.get('q') ?? ''}*`)
      const rows = (await db(`inbox_messages?select=conversation_id,content&content=ilike.${q}&limit=40`)) ?? []
      return send(res, 200, { payload: rows.map((r) => ({ id: r.conversation_id, messages: [{ content: r.content }] })) })
    }
    const chat = path.match(/^\/conversations\/(\d+)(\/.*)?$/)
    if (chat) {
      const id = Number(chat[1])
      const rest = chat[2] ?? ''
      if (req.method === 'GET' && rest === '') {
        const [row] = (await db(`inbox_chats?select=raw&conversation_id=eq.${id}`)) ?? []
        return send(res, row ? 200 : 404, row?.raw)
      }
      if (req.method === 'GET' && rest === '/messages') {
        const before = url.searchParams.get('before')
        const rows = (await db(`inbox_messages?select=raw&conversation_id=eq.${id}${before ? `&id=lt.${before}` : ''}&order=id.desc&limit=20`)) ?? []
        return send(res, 200, { payload: rows.map((r) => r.raw).reverse() })
      }
      if (req.method === 'POST' && rest === '/messages') {
        const ctype = req.headers['content-type'] ?? ''
        const raw = await readBody(req)
        const body = ctype.includes('json') ? JSON.parse(raw || '{}') : {}
        const now = new Date()
        const [last] = (await db('inbox_messages?select=id&order=id.desc&limit=1')) ?? [{ id: 30000 }]
        const messageId = Math.max(30000, last?.id ?? 0) + 1
        const sender = body.content_attributes?.crm_sender ?? {}
        const message = {
          id: messageId, content: body.content ?? '', content_type: 'text', message_type: body.private ? 1 : 1, created_at: Math.floor(now / 1000),
          private: body.private === true, status: 'sent', source_id: `WAID:DEMO${messageId}`, content_attributes: body.content_attributes ?? {}, attachments: [],
          sender: { name: sender.name ?? 'School', type: 'user' }, conversation_id: id,
        }
        const [chatRow] = (await db(`inbox_chats?select=inbox_id&conversation_id=eq.${id}`)) ?? [{}]
        await db('inbox_messages', { method: 'POST', body: JSON.stringify({
          id: messageId, account_id: 1, conversation_id: id, inbox_id: chatRow?.inbox_id ?? 1, message_type: 1, direction: 'outgoing',
          sender_kind: sender.id ? 'staff' : 'phone', staff_id: sender.id ? Number(sender.id) : null, content: message.content, attachments: [],
          private: message.private, deleted: false, edited: false, created_at: now.toISOString(), source: 'copy', raw: message }) })
        await db(`inbox_chats?conversation_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({
          last_message_id: messageId, last_message_at: now.toISOString(), last_activity_at: now.toISOString(), last_message_preview: message.content.slice(0, 80),
          last_message_raw: message, unread_count: 0, waiting_since: null }) })
        return send(res, 200, message)
      }
      if (req.method === 'POST' && (rest === '/update_last_seen' || rest === '/unread')) {
        await db(`inbox_chats?conversation_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ unread_count: rest === '/unread' ? 1 : 0 }) })
        return send(res, 200, {})
      }
      if (req.method === 'POST' && rest === '/toggle_status') {
        const body = JSON.parse((await readBody(req)) || '{}')
        await db(`inbox_chats?conversation_id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ status: body.status ?? 'resolved' }) })
        return send(res, 200, { payload: { current_status: body.status } })
      }
      return send(res, 200, {})
    }
    if (req.method === 'GET' && path === '/inboxes') {
      const rows = (await db('inbox_channels?select=chatwoot_inbox_id,kind,label&order=chatwoot_inbox_id')) ?? []
      const type = { whatsapp: 'Channel::Api', messenger: 'Channel::FacebookPage', instagram: 'Channel::FacebookPage' }
      return send(res, 200, { payload: rows.map((r) => ({ id: r.chatwoot_inbox_id, name: r.label, channel_type: type[r.kind] ?? 'Channel::Api', phone_number: null })) })
    }
    if (path.startsWith('/contacts')) return send(res, 200, { payload: [] })
    return send(res, 200, { payload: [] })
  } catch (error) {
    console.error(error)
    send(res, 500, { error: String(error) })
  }
}).listen(PORT, '127.0.0.1', () => console.log(`fake Chatwoot gateway on http://127.0.0.1:${PORT}`))
