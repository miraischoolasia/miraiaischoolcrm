import type { ChatRole, ChatwootMessage } from './whatsappInbox'

// Who is on the other end, read from what they wrote. It only says "student" or "parent" when
// the words are unmistakable (a whole message that is "我是学生", or a short answer to the team's
// own "学生本人还是家长" question); anything longer or vaguer says nothing, and the team picks.

// Spaces, punctuation and emoji are not part of the meaning.
function plain(text: string) {
  return text
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .replace(/(啦|哦|咯|呀|喔|耶|哈|的)+$/u, '')
}

const STUDENT_STRONG = /^(我是|我就是|本人是|是)(学生|学生本人|同学|学生自己)$|^(iam|im|iamthe|imthe|iama|ima)(student|studentmyself|studentmyself)$/u
const PARENT_STRONG = /^(我是|我就是|是)(家长|妈妈|妈咪|爸爸|妈|爸|母亲|父亲|学生家长|学生的家长|孩子的妈妈|孩子的爸爸)$|^(iam|im)(the|a)?(parent|mom|mum|mother|dad|father)$/u
// A bare answer is only an answer when the team had just asked who it is.
const STUDENT_BARE = /^(学生|学生本人|本人|同学|student)$/u
const PARENT_BARE = /^(家长|妈妈|妈咪|爸爸|妈|爸|母亲|父亲|parent|mom|mum|dad)$/u

function isWhoQuestion(text: string) {
  return text.includes('学生') && (text.includes('家长') || text.includes('本人'))
}

// The latest clear signal in the chat: 'student', 'parent', or null when there is none.
export function detectChatRole(messages: ChatwootMessage[]): ChatRole | null {
  let found: ChatRole | null = null
  let previousAsked = false
  for (const message of messages) {
    if (message.private || message.content_attributes?.deleted) {
      continue
    }
    const text = (message.content ?? '').trim()
    if (message.message_type === 1) {
      previousAsked = isWhoQuestion(text)
      continue
    }
    if (message.message_type !== 0 || !text || text.length > 40) {
      previousAsked = false
      continue
    }
    const flat = plain(text)
    if (STUDENT_STRONG.test(flat) || (previousAsked && STUDENT_BARE.test(flat))) {
      found = 'student'
    } else if (PARENT_STRONG.test(flat) || (previousAsked && PARENT_BARE.test(flat))) {
      found = 'parent'
    }
    previousAsked = false
  }
  return found
}
