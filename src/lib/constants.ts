import type { AgeGroup, FilterKey, ProgramLevel } from '../types/domain'

export const studentFilterOptions: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'hoa', label: 'HOA' },
  { key: 'trial', label: 'Trial' },
  { key: 'regular', label: 'Regular' },
  { key: 'camp', label: 'Camp' },
]

export const ageGroupOptions: AgeGroup[] = [
  '6-8 Years Old',
  '9-11 Years Old',
  '12-14 Years Old',
  '15-17 Years Old',
]

export const programLevelOptions: ProgramLevel[] = [
  'Coder Foundation',
  'Coder Pro',
  'VibeTech Innovator',
  'VibeTech Pro',
  'VibeTech Future',
  'Software Engineer',
]

// The stages a lead can be in: the school's own (see leadStages.ts).
export { leadStatusOptions } from './leadStages'

export const leadChildAgeOptions = Array.from({ length: 15 }, (_, index) => index + 4)

// The 13 states and 3 federal territories of Malaysia, as stored on a lead.
export const MALAYSIAN_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perak',
  'Perlis',
  'Pulau Pinang',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'Kuala Lumpur',
  'Labuan',
  'Putrajaya',
] as const

export const MAX_LEAD_CHILDREN = 3

export const MAX_LEAD_FOLLOW_UPS = 7
