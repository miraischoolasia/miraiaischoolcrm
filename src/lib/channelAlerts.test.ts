import { describe, expect, it } from 'vitest'
import { alertLevel, alertWords, howLong, whatsAppNumberAlerts, type WhatsAppNumberStatus } from './channelAlerts'

const NOW = Date.parse('2026-10-20T10:00:00Z')
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

function number(overrides: Partial<WhatsAppNumberStatus>): WhatsAppNumberStatus {
  return {
    inboxId: 3,
    label: 'Main',
    phone: '60120000001',
    instance: 'school-1',
    isActive: true,
    status: 'connected',
    reason: null,
    changedAt: ago(600),
    checkedAt: ago(1),
    lastMessageAt: ago(10),
    ...overrides,
  }
}

describe('whatsAppNumberAlerts', () => {
  it('says nothing for a working number, one turned off, or one not checked yet', () => {
    expect(
      whatsAppNumberAlerts(
        [number({}), number({ inboxId: 4, status: 'logged_out', isActive: false }), number({ inboxId: 5, status: null })],
        null,
        true,
        NOW,
      ),
    ).toEqual([])
  })

  it('reports each problem the server writes, the worst first', () => {
    const alerts = whatsAppNumberAlerts(
      [
        number({ inboxId: 6, label: 'Quiet one', phone: null, status: 'quiet', lastMessageAt: ago(150) }),
        number({ inboxId: 7, label: 'Sales', status: 'needs_qr' }),
        number({ inboxId: 8, label: 'Front desk', status: 'logged_out', reason: '401 device_removed', changedAt: ago(1) }),
        number({ inboxId: 9, label: 'Branch', status: 'replaced' }),
        number({ inboxId: 10, label: 'Promo', status: 'restricted' }),
      ],
      null,
      false,
      NOW,
    )
    expect(alerts.map((alert) => alert.problem)).toEqual(['logged_out', 'replaced', 'restricted', 'needs_qr', 'quiet'])
    expect(alerts[0].detail).toBe('401 device_removed')
    // A quiet number counts from its last message.
    expect(alerts[4].since).toBe(ago(150))
  })

  it('shows reconnecting only after 10 minutes', () => {
    expect(whatsAppNumberAlerts([number({ status: 'reconnecting', changedAt: ago(4) })], null, true, NOW)).toEqual([])
    expect(whatsAppNumberAlerts([number({ status: 'reconnecting', changedAt: ago(12) })], null, true, NOW)[0].problem).toBe(
      'reconnecting',
    )
  })

  it('tells only an admin when the checker has stopped', () => {
    const stale = [number({ checkedAt: ago(30) })]
    expect(whatsAppNumberAlerts(stale, null, true, NOW)[0].problem).toBe('unchecked')
    expect(whatsAppNumberAlerts(stale, null, false, NOW)).toEqual([])
  })

  it('shows staff only the numbers they work on', () => {
    const numbers = [number({ inboxId: 3, status: 'logged_out' }), number({ inboxId: 6, status: 'restricted' })]
    expect(whatsAppNumberAlerts(numbers, [6], false, NOW).map((alert) => alert.inboxId)).toEqual([6])
    expect(whatsAppNumberAlerts(numbers, [], false, NOW)).toEqual([])
  })
})

describe('alertWords', () => {
  it('says what happened and what to do next in plain words', () => {
    const [loggedOut] = whatsAppNumberAlerts([number({ status: 'logged_out', changedAt: ago(180) })], null, true, NOW)
    const words = alertWords(loggedOut, NOW)
    expect(words.title).toBe('WhatsApp Main (60120000001) is logged out')
    expect(words.what).toContain('3 hours ago')
    expect(words.next).toContain('Linked devices')
    expect(words.scanFixes).toBe(true)
    expect(alertLevel('logged_out')).toBe('danger')

    const [replaced] = whatsAppNumberAlerts([number({ status: 'replaced' })], null, true, NOW)
    expect(alertWords(replaced, NOW).next).toContain('WhatsApp Web')

    const [restricted] = whatsAppNumberAlerts([number({ status: 'restricted' })], null, true, NOW)
    expect(alertWords(restricted, NOW).scanFixes).toBe(false)

    const [quiet] = whatsAppNumberAlerts([number({ status: 'quiet', lastMessageAt: ago(150) })], null, true, NOW)
    expect(alertWords(quiet, NOW).title).toBe('No parent messages on WhatsApp Main (60120000001) for 3 hours')
    expect(alertLevel('quiet')).toBe('warning')
  })

  it('works for other channels too', () => {
    const words = alertWords({ key: 'm', channel: 'messenger', name: 'EduHero Page', problem: 'reconnecting', since: null }, NOW)
    expect(words.title).toBe('Messenger EduHero Page is not connected')
  })

  it('tells how long', () => {
    expect(howLong(ago(1), NOW)).toBe('for 1 minute')
    expect(howLong(ago(90), NOW)).toBe('for 2 hours')
    expect(howLong(ago(3 * 24 * 60), NOW)).toMatch(/^since /)
    expect(howLong(null, NOW)).toBe('')
  })
})
