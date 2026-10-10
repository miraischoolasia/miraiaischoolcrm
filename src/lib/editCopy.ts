// When a message is edited, Evolution writes the new text into the chat as a message of its own, headed
// "`Edited Message:`", under the same WhatsApp id as the message that was edited. The edited message
// already shows its new text, so that copy only makes the chat show the same message twice.

const EDIT_HEADING = /^\s*`Edited[^`\n]{0,30}:`\s*/i

export function isEditCopy(content: string | null | undefined) {
  return EDIT_HEADING.test(content ?? '')
}

// The edited text, without the heading Evolution put in front of it.
export function withoutEditHeading(content: string | null | undefined) {
  return (content ?? '').replace(EDIT_HEADING, '')
}
