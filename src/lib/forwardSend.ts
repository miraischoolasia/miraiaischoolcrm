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
