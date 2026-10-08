// The emoji the message box offers, grouped. Written out here so the page needs no
// extra library and nothing is downloaded when it opens.

export type EmojiGroup = { id: string; label: string; icon: string; emojis: string[] }

// One entry per emoji. A symbol that a phone may draw as plain text (a heart, a
// victory hand) gets the "show as a picture" mark so it looks the same everywhere.
const TEXT_SYMBOLS = /^[←-⇿⌀-⏿☀-➿⬀-⯿]$/u
const split = (text: string) =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)]
    .map((part) => part.segment)
    .filter((part) => part.trim() !== '')
    .map((part) => (TEXT_SYMBOLS.test(part) ? `${part}️` : part))

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: split(
      '😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬',
    ),
  },
  {
    id: 'gestures',
    label: 'Hands',
    icon: '👍',
    emojis: split('👍👎👌🤌🤏✌🤞🤟🤘🤙👈👉👆👇☝✋🤚🖐🖖👋🤝🙏💪👏🙌👐🤲✍🫶🫡'),
  },
  {
    id: 'hearts',
    label: 'Hearts',
    icon: '❤️',
    emojis: split('❤🧡💛💚💙💜🖤🤍🤎💔❣💕💞💓💗💖💘💝✨⭐🌟💫🔥💯✅❌❗❓⚠🎉🎊🎈'),
  },
  {
    id: 'school',
    label: 'School',
    icon: '📚',
    emojis: split('📚📖✏📝💻🖥📱🤖🎮🧠🏆🥇🎓🎒📅⏰📞📍💡🔔🎁🏫🧩🎨🎬📷🚀🔬🔭'),
  },
  {
    id: 'nature',
    label: 'Nature & food',
    icon: '🌈',
    emojis: split('🌈☀🌙🌸🌼🌻🌳🍎🍌🍉🍓🍰🍪🍕🍔🍟🍜🍚☕🥤🧋'),
  },
]

const RECENT_KEY = 'whatsapp-recent-emoji'
const RECENT_LIMIT = 16

export function readRecentEmoji(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === 'string').slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

// Newest first, no repeats.
export function rememberEmoji(emoji: string) {
  const next = [emoji, ...readRecentEmoji().filter((item) => item !== emoji)].slice(0, RECENT_LIMIT)
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // A private window can refuse storage; the recent row just stays empty.
  }
  return next
}

// The text with the emoji put where the cursor was (replacing any selected words),
// and where the cursor goes after it.
export function insertAt(text: string, emoji: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, text.length))
  const to = Math.max(from, Math.min(end, text.length))
  return { text: `${text.slice(0, from)}${emoji}${text.slice(to)}`, cursor: from + emoji.length }
}
