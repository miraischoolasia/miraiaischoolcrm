import { getSupabaseAccessToken } from './accessToken'

// Things WhatsApp can do that Chatwoot does not carry (reactions, editing and deleting a sent
// message, what the other side did on their phone), reached through the school's gateway, which
// checks the login and adds the secret key. The browser never holds that key.

// WhatsApp's own address of one message.
export type WaKey = { id: string; fromMe: boolean; remoteJid: string }

export type Reaction = { emoji: string; byUs: boolean }

// What happened to messages after they were sent, found in WhatsApp's own record.
export type MessageEvents = {
  // By the id of the message that was reacted to.
  reactions: Map<string, Reaction[]>
  // The text a message was changed to, by the id of the message.
  edits: Map<string, string>
  // The text WhatsApp holds now for recent text messages, by id. A message changed through the API
  // is changed in place there, so this is how an edit shows after the page is reloaded.
  texts: Map<string, string>
  // Messages taken back for everyone.
  deleted: Set<string>
}

export const NO_EVENTS: MessageEvents = { reactions: new Map(), edits: new Map(), texts: new Map(), deleted: new Set() }

type Row = {
  key?: { id?: string; fromMe?: boolean; remoteJid?: string }
  messageTimestamp?: number
  message?: {
    conversation?: string
    reactionMessage?: { key?: { id?: string }; text?: string }
    protocolMessage?: {
      type?: number | string
      key?: { id?: string }
      editedMessage?: { conversation?: string; extendedTextMessage?: { text?: string } }
    }
  }
}

// Turns WhatsApp's records of reactions and edits into what each message should show. The newest
// reaction of each person wins, and an empty one means it was taken back.
export function parseEvents(rows: Row[]): MessageEvents {
  const events: MessageEvents = { reactions: new Map(), edits: new Map(), texts: new Map(), deleted: new Set() }
  const newest = new Map<string, { at: number; emoji: string; byUs: boolean; target: string }>()
  const editedAt = new Map<string, number>()

  for (const row of rows) {
    const at = row.messageTimestamp ?? 0
    if (typeof row.message?.conversation === 'string' && row.key?.id) {
      events.texts.set(row.key.id, row.message.conversation)
      continue
    }
    const reaction = row.message?.reactionMessage
    if (reaction?.key?.id) {
      const byUs = row.key?.fromMe === true
      const slot = `${reaction.key.id}|${byUs ? 'us' : 'them'}`
      const known = newest.get(slot)
      if (!known || at >= known.at) {
        newest.set(slot, { at, emoji: reaction.text ?? '', byUs, target: reaction.key.id })
      }
      continue
    }
    const protocol = row.message?.protocolMessage
    const target = protocol?.key?.id
    if (!protocol || !target) {
      continue
    }
    if (protocol.type === 14 || protocol.type === 'MESSAGE_EDIT') {
      const text = protocol.editedMessage?.conversation ?? protocol.editedMessage?.extendedTextMessage?.text
      if (text !== undefined && at >= (editedAt.get(target) ?? 0)) {
        editedAt.set(target, at)
        events.edits.set(target, text)
      }
    } else if (protocol.type === 0 || protocol.type === 'REVOKE') {
      events.deleted.add(target)
    }
  }

  for (const entry of newest.values()) {
    if (!entry.emoji) {
      continue
    }
    const list = events.reactions.get(entry.target) ?? []
    list.push({ emoji: entry.emoji, byUs: entry.byUs })
    events.reactions.set(entry.target, list)
  }
  return events
}

// Chatwoot gives the message id as "WAID:3EB0..."; WhatsApp itself uses what follows.
export function waIdOf(sourceId: string | null | undefined) {
  return sourceId?.startsWith('WAID:') ? sourceId.slice(5) : null
}

// What can be sent besides text and files.
export type SpecialMessage =
  | { kind: 'location'; latitude: number; longitude: number; name: string; address: string }
  | { kind: 'contact'; fullName: string; phone: string }
  | { kind: 'poll'; question: string; options: string[]; selectableCount: number }
  | { kind: 'sticker'; file: File }

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

// A label put on a chat on the phone (WhatsApp Business labels).
export type WaLabel = { id: string; name: string; color: string }

// WhatsApp numbers its label colours; these are close to what the phone shows.
const LABEL_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0d9488', '#dc2626', '#4b5563', '#ea580c', '#0891b2']

export function labelColor(index: string | number | null | undefined) {
  const number = Number(index)
  return LABEL_COLORS[Number.isFinite(number) ? Math.abs(number) % LABEL_COLORS.length : 0]
}

export type WaActions = ReturnType<typeof createWaActions>

export function createWaActions(
  apiUrl: string,
  getAccessToken: () => Promise<string | null> = getSupabaseAccessToken,
) {
  async function call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const token = await getAccessToken()
    const headers = new Headers()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }
    const response = await fetch(`${apiUrl}/wa/evo${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) {
      throw new Error(`WhatsApp request failed (${response.status})`)
    }
    const text = await response.text()
    return (text ? JSON.parse(text) : null) as T
  }

  const found = new Map<string, WaKey | null>()
  let labelNames: Map<string, WaLabel> | null = null

  // The address WhatsApp keeps for a message: the hidden ID it filed the chat under, and who wrote it.
  async function keyOf(waId: string): Promise<WaKey | null> {
    if (found.has(waId)) {
      return found.get(waId) ?? null
    }
    const data = await call<{ messages?: { records?: Row[] } }>('POST', '/chat/findMessages', {
      where: { key: { id: waId } },
      page: 1,
      offset: 1,
    })
    const key = data.messages?.records?.[0]?.key
    const result = key?.id && key.remoteJid ? { id: key.id, fromMe: key.fromMe === true, remoteJid: key.remoteJid } : null
    if (result) {
      found.set(waId, result)
    }
    return result
  }

  async function needKey(waId: string) {
    const key = await keyOf(waId)
    if (!key) {
      throw new Error('WhatsApp does not know this message.')
    }
    return key
  }

  return {
    keyOf,

    // An empty emoji takes the reaction back.
    async react(waId: string, emoji: string) {
      const key = await needKey(waId)
      await call('POST', '/message/sendReaction', { key, reaction: emoji })
    },

    // Takes the message back for everyone, which WhatsApp allows for a while after sending.
    async deleteForEveryone(waId: string) {
      const key = await needKey(waId)
      await call('DELETE', '/chat/deleteMessageForEveryone', key)
    },

    // Changes the text of a sent message, which WhatsApp allows for 15 minutes.
    async edit(waId: string, text: string) {
      const key = await needKey(waId)
      await call('POST', '/chat/updateMessage', { number: key.remoteJid, key, text })
    },

    // The labels the team put on these chats on the phone (read only here). Labels with no name are left out.
    async labelsOf(remoteJids: string[]): Promise<WaLabel[]> {
      if (!labelNames) {
        const all = await call<{ id: string; name: string; color: string | number }[]>('GET', '/label/findLabels')
        labelNames = new Map(all.map((label) => [String(label.id), { id: String(label.id), name: label.name, color: labelColor(label.color) }]))
      }
      const ids = new Set<string>()
      for (const remoteJid of remoteJids) {
        const chats = await call<{ labels?: string[] | string | null }[]>('POST', '/chat/findChats', { where: { remoteJid } })
        for (const chat of chats ?? []) {
          const raw = typeof chat.labels === 'string' ? (JSON.parse(chat.labels) as string[]) : (chat.labels ?? [])
          raw.forEach((id) => ids.add(String(id)))
        }
      }
      return [...ids].flatMap((id) => {
        const label = labelNames?.get(id)
        return label?.name ? [label] : []
      })
    },

    // Shows the parent "typing..." for a few seconds.
    async showTyping(phone: string) {
      await call('POST', '/chat/sendPresence', { number: phone, presence: 'composing', delay: 3500 })
    },

    // Sends a location, a contact card, a poll or a sticker to the chat that this message is in.
    async sendSpecial(chatMessageWaId: string, message: SpecialMessage): Promise<string | null> {
      const { remoteJid } = await needKey(chatMessageWaId)
      const sent = async (path: string, body: unknown) =>
        (await call<{ key?: { id?: string } } | null>('POST', path, body))?.key?.id ?? null
      if (message.kind === 'location') {
        return sent('/message/sendLocation', {
          number: remoteJid,
          latitude: message.latitude,
          longitude: message.longitude,
          name: message.name,
          address: message.address,
        })
      } else if (message.kind === 'contact') {
        const digits = message.phone.replace(/\D/g, '')
        return sent('/message/sendContact', {
          number: remoteJid,
          contact: [{ fullName: message.fullName, wuid: digits, phoneNumber: `+${digits}` }],
        })
      } else if (message.kind === 'poll') {
        return sent('/message/sendPoll', {
          number: remoteJid,
          name: message.question,
          selectableCount: message.selectableCount,
          values: message.options,
        })
      }
      return sent('/message/sendSticker', { number: remoteJid, sticker: await toBase64(message.file) })
    },

    // What the other side did to the messages of these chats (reactions, edits, deletes).
    async events(remoteJids: string[]): Promise<MessageEvents> {
      const rows: Row[] = []
      for (const remoteJid of remoteJids) {
        for (const messageType of ['reactionMessage', 'protocolMessage', 'conversation']) {
          const data = await call<{ messages?: { records?: Row[] } }>('POST', '/chat/findMessages', {
            where: { messageType, key: { remoteJid } },
            page: 1,
            offset: 200,
          })
          rows.push(...(data.messages?.records ?? []))
        }
      }
      return parseEvents(rows)
    },
  }
}
