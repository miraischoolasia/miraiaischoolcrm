import { createSettingStore } from './settingStore'

// How a school shows a child's age: as an age (the default, Mirai) or as a school grade (EduHero). The school's own
// choice is the row `age_display` in app_settings (Class Settings > Age or grade). It is read after sign-in (see
// settingStore), never before, and a failed read is not remembered.
export type AgeDisplayMode = 'age' | 'grade'

export function readAgeDisplay(value: unknown): AgeDisplayMode {
  const mode = value && typeof value === 'object' ? (value as { mode?: unknown }).mode : undefined
  return mode === 'grade' ? 'grade' : 'age'
}

const store = createSettingStore<AgeDisplayMode>('age_display', readAgeDisplay, 'age')

export const reloadAgeDisplay = store.reload

// The school's mode; every screen that shows or asks for an age reads it.
export const useAgeDisplay = store.use
