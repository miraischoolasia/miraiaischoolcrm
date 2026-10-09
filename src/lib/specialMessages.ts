// A shared location or contact reaches Chatwoot as formatted text (Evolution writes it that way).
// This reads that text back, so the chat can show a card instead of lines with stars and underscores.

export type LocationCard = { kind: 'location'; lat: string; lng: string; name: string | null; address: string | null; url: string }
export type ContactCard = { kind: 'contact'; name: string; numbers: string[] }
export type PollCard = { kind: 'poll'; question: string; options: string[] }

const MAPS_URL = /https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/

// What follows "Label:" on its line, without the stars and underscores around the label.
function valueOf(text: string, label: RegExp) {
  const line = text.split('\n').find((entry) => label.test(entry.replace(/[*_]/g, '')))
  if (!line) {
    return null
  }
  const value = line.replace(/[*_]/g, '').replace(label, '').trim()
  return value || null
}

export function parseSpecialMessage(text: string | null | undefined): LocationCard | ContactCard | PollCard | null {
  const content = (text ?? '').trim()
  const poll = /^\W*Poll:\W*([^\n]+)\n((?:\d+\. [^\n]+\n?)+)$/.exec(content)
  if (poll) {
    return { kind: 'poll', question: poll[1].trim(), options: poll[2].trim().split('\n').map((line) => line.replace(/^\d+\. /, '').trim()) }
  }
  const maps = MAPS_URL.exec(content)
  if (maps && /^\W*\w+:\W*\n/.test(content)) {
    return {
      kind: 'location',
      lat: maps[1],
      lng: maps[2],
      name: valueOf(content, /^[^:]*[Nn]ame:/),
      address: valueOf(content, /^[^:]*[Aa]ddress:/),
      url: maps[0],
    }
  }
  if (/^\W*Contact:\W*\n/.test(content)) {
    const name = valueOf(content, /^Name:/)
    const numbers = content
      .split('\n')
      .map((line) => line.replace(/[*_]/g, '').trim())
      .filter((line) => /^Number \(\d+\):/.test(line))
      .map((line) => line.replace(/^Number \(\d+\):/, '').trim())
      .filter(Boolean)
    if (name || numbers.length > 0) {
      return { kind: 'contact', name: name ?? numbers[0], numbers }
    }
  }
  return null
}

// A picture that is WhatsApp's own sticker: they arrive as .webp, a photo never does.
export function isSticker(attachment: { file_type: string; extension?: string | null; data_url: string }) {
  if (attachment.file_type !== 'image') {
    return false
  }
  const extension = attachment.extension ?? attachment.data_url.split('?')[0].split('.').pop() ?? ''
  return extension.toLowerCase() === 'webp'
}

// The lines to put in the chat for a location, contact or poll that was just sent, written the way
// Evolution writes the ones that come in, so the chat shows the same card for both.
export function describeSent(
  message:
    | { kind: 'location'; latitude: number; longitude: number; name: string; address: string }
    | { kind: 'contact'; fullName: string; phone: string }
    | { kind: 'poll'; question: string; options: string[] },
) {
  if (message.kind === 'location') {
    const { latitude, longitude, name, address } = message
    return [
      '*Location:*',
      '',
      `_Latitude:_ ${latitude} `,
      `_Longitude:_ ${longitude} `,
      ...(name ? [`_Location Name:_ ${name}`] : []),
      ...(address ? [`_Location Address:_ ${address} `] : []),
      `_Location URL:_ https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    ].join('\n')
  }
  if (message.kind === 'contact') {
    return ['*Contact:*', '', `_Name:_ ${message.fullName}`, `_Number (1):_ +${message.phone.replace(/\D/g, '')}`].join('\n')
  }
  return [`*Poll:* ${message.question}`, ...message.options.map((option, index) => `${index + 1}. ${option}`)].join('\n')
}

// One plain line for a message that holds a card (a location, contact or poll), for quotes, stars and
// the forward list; anything else comes back as it is.
export function summarizeMessage(text: string | null | undefined) {
  const card = parseSpecialMessage(text)
  if (card?.kind === 'location') {
    return `Location: ${card.name ?? 'shared location'}`
  }
  if (card?.kind === 'contact') {
    return `Contact: ${card.name}`
  }
  if (card?.kind === 'poll') {
    return `Poll: ${card.question}`
  }
  return (text ?? '').trim()
}
