import type {
  AgeGroup,
  FilterKey,
  LeadStatus,
  PerformanceMetricKey,
  ProgramLevel,
  ReviewRemarkField,
  ReviewScoreField,
} from '../types/domain'

export const performanceMetricDefinitions: Array<{
  key: PerformanceMetricKey
  scoreField: ReviewScoreField
  remarkField: ReviewRemarkField
  shortLabel: string
  label: string
}> = [
  {
    key: 'logicalThinking',
    scoreField: 'logicalThinkingScore',
    remarkField: 'logicalThinkingRemark',
    shortLabel: 'Logic',
    label: 'Logical & Algorithmic Thinking',
  },
  {
    key: 'codingCreativity',
    scoreField: 'codingCreativityScore',
    remarkField: 'codingCreativityRemark',
    shortLabel: 'Creative',
    label: 'Coding Creativity',
  },
  {
    key: 'problemSolving',
    scoreField: 'problemSolvingScore',
    remarkField: 'problemSolvingRemark',
    shortLabel: 'Solve',
    label: 'Problem Solving',
  },
  {
    key: 'expressiveness',
    scoreField: 'expressivenessScore',
    remarkField: 'expressivenessRemark',
    shortLabel: 'Express',
    label: 'Expressiveness',
  },
  {
    key: 'sustainedFocus',
    scoreField: 'sustainedFocusScore',
    remarkField: 'sustainedFocusRemark',
    shortLabel: 'Focus',
    label: 'Sustained Focus',
  },
]

export const pathwayMetricColors: Record<PerformanceMetricKey, string> = {
  logicalThinking: '#fc0c97',
  codingCreativity: '#8b5cf6',
  problemSolving: '#0ea5e9',
  expressiveness: '#f59e0b',
  sustainedFocus: '#10b981',
}

export const studentFilterOptions: Array<{ key: FilterKey; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'hoa', label: 'HOA' },
  { key: 'trial', label: 'Trial' },
  { key: 'regular', label: 'Regular' },
  { key: 'camp', label: 'Camp' },
  { key: 'followUp', label: 'Need Follow Up' },
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

export const leadStatusOptions: Array<{ key: LeadStatus; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'trial_scheduled', label: 'Trial Scheduled' },
  { key: 'trial_completed', label: 'Trial Completed' },
  { key: 'converted', label: 'Converted' },
  { key: 'lost', label: 'Lost' },
]

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
