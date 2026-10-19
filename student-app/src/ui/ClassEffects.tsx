import type { ClassLiveState } from '@/lib/classRoom'

// Phones join the class in the Zoom app, so the class page's moments over the
// video are for the web build only (ClassEffects.web.tsx).
export function ClassMoments(_props: { state: ClassLiveState | null; clockOffset: number; myId: number }) {
  return null
}

export function ClassBar(_props: { state: ClassLiveState | null; clockOffset: number; myId: number; color: string }) {
  return null
}
