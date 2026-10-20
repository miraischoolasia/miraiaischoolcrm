// A school can have many WhatsApp numbers on one gateway. Each request about a number says which one with
// ?instance=<its Evolution name>, read from the numbers table (never written into the code). A school with no
// names set up (Mirai) sends none, and the gateway uses its own one number, as before.

export type InstanceSource = { inboxId: number; instance: string | null }

// The Evolution name of the number a chat is on; null when the school has not written one down.
export function instanceOfInbox(numbers: InstanceSource[], inboxId: number | null | undefined): string | null {
  if (inboxId === null || inboxId === undefined) {
    return null
  }
  const name = numbers.find((entry) => entry.inboxId === inboxId)?.instance?.trim()
  return name ? name : null
}

// The address with ?instance= added (or &instance= when it has a query already); unchanged without a name.
export function withInstance(url: string, instance: string | null | undefined): string {
  if (!instance) {
    return url
  }
  return `${url}${url.includes('?') ? '&' : '?'}instance=${encodeURIComponent(instance)}`
}
