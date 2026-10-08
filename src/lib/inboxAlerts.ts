// Small helpers for telling the team a new WhatsApp message arrived.

const SOUND_KEY = 'whatsapp-inbox-sound'

export function isSoundOn() {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSoundOn(on: boolean) {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch {
    // Private windows can refuse storage; the choice just won't be remembered.
  }
}

const ALERT_SOUND_URL = '/sounds/new-message.mp3'
let alertSound: HTMLAudioElement | null = null

// The team's notification sound. If the file cannot play (blocked or missing), a plain beep is used.
export function playAlertSound() {
  try {
    alertSound ??= new Audio(ALERT_SOUND_URL)
    alertSound.currentTime = 0
    void alertSound.play().catch(playBeep)
  } catch {
    playBeep()
  }
}

function playBeep() {
  try {
    const AudioContextClass =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) {
      return
    }
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.4)
    oscillator.onended = () => void context.close()
  } catch {
    // Browsers keep sound off until the page has been clicked; nothing to do.
  }
}

export function desktopAlertsStatus(): 'on' | 'off' | 'blocked' | 'unsupported' {
  if (typeof Notification === 'undefined') {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') {
    return 'on'
  }
  return Notification.permission === 'denied' ? 'blocked' : 'off'
}

export async function enableDesktopAlerts() {
  if (typeof Notification === 'undefined') {
    return 'unsupported' as const
  }
  await Notification.requestPermission()
  return desktopAlertsStatus()
}

export function showDesktopAlert(title: string, body: string) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'whatsapp-inbox' })
    }
  } catch {
    // Some browsers only allow notifications from a service worker.
  }
}
