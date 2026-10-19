import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTO_SEND,
  autoSendErrorMessage,
  hourLabel,
  senderIsFine,
  senderState,
  senderWakesAt,
  validateAutoSend,
} from './autoSend'

const NOW = Date.parse('2026-10-17T10:00:00+08:00')

describe('the sender program', () => {
  it('is never seen, online, or offline by how long ago it asked for work', () => {
    expect(senderState(null, NOW)).toBe('never')
    expect(senderState(new Date(NOW - 20_000).toISOString(), NOW)).toBe('online')
    expect(senderState(new Date(NOW - 10 * 60_000).toISOString(), NOW)).toBe('offline')
  })

  it('is resting, not offline, while it sleeps until the time it gave', () => {
    const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString()
    // Seen 20 minutes ago, said it would ask again in 10 minutes: resting.
    expect(senderState(at(-20), NOW, at(10))).toBe('resting')
    expect(senderIsFine(senderState(at(-20), NOW, at(10)))).toBe(true)
    // Asks again within the minute (the day): simply running.
    expect(senderState(at(-0.5), NOW, at(0.5))).toBe('online')
    // The time passed, but less than 3 minutes ago: still fine.
    expect(senderState(at(-32), NOW, at(-2))).toBe('online')
    // More than 3 minutes past the time it gave: stopped.
    expect(senderState(at(-34), NOW, at(-4))).toBe('offline')
    expect(senderIsFine('offline')).toBe(false)
    expect(senderIsFine('never')).toBe(false)
    // An older sender that writes no time, but asked just now, is running.
    expect(senderState(at(-0.2), NOW, at(-60))).toBe('online')
  })

  it('tells the wake-up time in Kuala Lumpur time', () => {
    expect(senderWakesAt('2026-10-19T01:00:00Z')).toBe('09:00')
  })
})

describe('the sending rules', () => {
  it('accepts the defaults', () => {
    expect(validateAutoSend(DEFAULT_AUTO_SEND)).toBeNull()
  })

  it('refuses a limit or a pause outside what the database allows', () => {
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, dailyCap: 0 })).toMatch(/daily limit/)
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, dailyCap: 201 })).toMatch(/daily limit/)
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, gapSeconds: 5 })).toMatch(/pause/)
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, gapSeconds: 601 })).toMatch(/pause/)
  })

  it('needs the first hour before the last', () => {
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, fromHour: 21, untilHour: 9 })).toMatch(/before/)
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, fromHour: 9, untilHour: 9 })).toMatch(/before/)
    expect(validateAutoSend({ ...DEFAULT_AUTO_SEND, fromHour: 0, untilHour: 24 })).toBeNull()
  })

  it('writes an hour as a clock time', () => {
    expect(hourLabel(9)).toBe('09:00')
    expect(hourLabel(24)).toBe('00:00')
  })

  it('explains a database that is not set up yet and one that refuses', () => {
    expect(autoSendErrorMessage(new Error('column send_from_hour does not exist'), 'x')).toMatch(/not set up/)
    expect(autoSendErrorMessage(new Error('Only an admin can change this.'), 'x')).toMatch(/Only an admin/)
    expect(autoSendErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})
