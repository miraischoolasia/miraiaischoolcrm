// Forwarding sends the same parts (the text, then each file) to every chosen chat. Chatwoot answers as soon
// as it has the message, long before WhatsApp has it, so a file (slow) could be overtaken by the text after
// it. Each part therefore waits until WhatsApp has accepted it before the next one is sent, which is what
// an ordinary reply in the chat already does.
export async function forwardInOrder<Part>(
  targetIds: number[],
  parts: Part[],
  send: (targetId: number, part: Part) => Promise<{ id: number }>,
  waitUntilSent: (targetId: number, messageId: number) => Promise<void>,
) {
  for (const targetId of targetIds) {
    for (const part of parts) {
      const sent = await send(targetId, part)
      await waitUntilSent(targetId, sent.id)
    }
  }
}

// One chat that did not get the forward, and why.
export type ForwardFailure = { targetId: number; reason: string }

// The same, but every chat is tried: one chat that refuses (a Messenger chat outside Facebook's 24 hours) does not
// stop the others. Resolves to the chats that did not get everything.
export async function forwardToEach<Part>(
  targetIds: number[],
  parts: Part[],
  send: (targetId: number, part: Part) => Promise<{ id: number }>,
  waitUntilSent: (targetId: number, messageId: number) => Promise<void>,
): Promise<ForwardFailure[]> {
  const failures: ForwardFailure[] = []
  for (const targetId of targetIds) {
    try {
      for (const part of parts) {
        const sent = await send(targetId, part)
        await waitUntilSent(targetId, sent.id)
      }
    } catch (failure) {
      failures.push({ targetId, reason: forwardFailureReason(failure) })
    }
  }
  return failures
}

// Facebook and Instagram let a business write to someone only within 24 hours of that person's last message.
export const SOCIAL_WINDOW_SECONDS = 24 * 3600
export const SOCIAL_WINDOW_REASON =
  "Facebook and Instagram only let the school write within 24 hours of the person's last message. Wait for them to write again."

// What to tell the team about one chat that did not get it, from what the send or the gateway said.
export function forwardFailureReason(failure: unknown): string {
  const reason = (failure as { reason?: unknown })?.reason
  const said = typeof reason === 'string' && reason.trim() ? reason : failure instanceof Error ? failure.message : ''
  if (/24 hours|outside.*window|messaging window/i.test(said)) {
    return SOCIAL_WINDOW_REASON
  }
  if (said === 'timeout') {
    return 'The app has not confirmed it yet. Look at that chat before you send it again.'
  }
  if (said === 'file') {
    return "A file of the message couldn't be downloaded to send it on."
  }
  if (said === 'failed' || !said) {
    return 'It did not go through.'
  }
  return said.length > 160 ? `${said.slice(0, 157)}...` : said
}
