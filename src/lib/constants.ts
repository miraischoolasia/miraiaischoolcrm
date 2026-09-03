import type {
  AgeGroup,
  FilterKey,
  LeadSource,
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

export const studentFilterOptions: Array<{ key: FilterKey; label: string }> = [
  { key: 'hours', label: 'Classes Low / Expired' },
  { key: 'accountFee', label: 'Account Fee Due' },
  { key: 'mirai', label: 'Mirai Club Due' },
  { key: 'normal', label: 'All Normal' },
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

export const leadSourceOptions: Array<{ key: LeadSource; label: string }> = [
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'referral', label: 'Referral' },
  { key: 'social_media', label: 'Social Media' },
  { key: 'advertisement', label: 'Advertisement' },
  { key: 'other', label: 'Other' },
]
