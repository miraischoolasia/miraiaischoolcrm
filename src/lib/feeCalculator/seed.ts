// The prices of EC's code on 2026-08-17 (rateData.ts and the subject lists of FeeCalculatorStandalone.tsx before
// commit 7845720), which the owner chose to start with (2026-10-22). The migration 20261030300000_fee_calculator.sql
// puts the same numbers in the database, and feeCalculator.test.ts checks the two agree. After that an admin changes
// the prices on the Fee Calculator's Price settings tab; this file is only the starting point and the tests' data.

import type { CycleTier, GlobalRates, SubjectKind } from './types'
import type { FeeLevel, FeeTrack } from './quote'

export const DEFAULT_GLOBAL_RATES: GlobalRates = {
  materialsFeePerSubjectPerMonth: 5,
  postage: {
    west: 10,
    east: {
      '1_2': { '1_2': 20, '3': 20 },
      '3_4': { '1_2': 25, '3': 30 },
      '5_plus': { '1_2': 30, '3': 40 },
    },
  },
  registrationFeeAmount: 20,
  sejSurchargePerMonth: 10,
}

export type SeedRate = { level: FeeLevel; track: FeeTrack; subjectCount: number; cycleTier: CycleTier; amount: number }
export type SeedCohort = { membershipName: string; materialsIncludedInTuition: boolean; rates: SeedRate[] }

// [subjectCount, monthly, 3 months at once, 6 months+]
function table(level: FeeLevel, track: FeeTrack, rows: [number, number, number, number][]): SeedRate[] {
  return rows.flatMap(([subjectCount, monthly, threeMo, sixMoPlus]) => [
    { level, track, subjectCount, cycleTier: 'monthly' as const, amount: monthly },
    { level, track, subjectCount, cycleTier: '3mo' as const, amount: threeMo },
    { level, track, subjectCount, cycleTier: '6mo_plus' as const, amount: sixMoPlus },
  ])
}

// 26001: the same price in all three columns.
function flat(level: FeeLevel, track: FeeTrack, rows: [number, number][]): SeedRate[] {
  return table(level, track, rows.map(([count, amount]) => [count, amount, amount, amount]))
}

const STANDARD_26002: [number, number, number, number][] = [
  [1, 68, 65, 63],
  [2, 130, 124, 120],
  [3, 195, 186, 180],
  [4, 244, 232, 224],
  [5, 305, 290, 280],
  [6, 366, 348, 336],
  [7, 406, 385, 371],
  [8, 456, 432, 416],
]
const STANDARD_26001: [number, number][] = [
  [1, 59],
  [2, 114],
  [3, 169],
  [4, 219],
  [5, 270],
  [6, 318],
  [7, 371],
  [8, 416],
]

export const SEED_COHORTS: SeedCohort[] = [
  {
    // EC called it "current"; its label was 26002.
    membershipName: '26002',
    materialsIncludedInTuition: true,
    rates: [
      ...table('primary', 'standard', STANDARD_26002),
      ...table('secondary', 'standard', [...STANDARD_26002, [9, 513, 486, 468], [10, 550, 520, 500]]),
      ...table('secondary', 'bio_che_phy', [
        [1, 70, 67, 65],
        [2, 135, 129, 125],
        [3, 195, 186, 180],
      ]),
    ],
  },
  {
    membershipName: '26001',
    materialsIncludedInTuition: false,
    rates: [
      ...flat('primary', 'standard', STANDARD_26001),
      ...flat('secondary', 'standard', [...STANDARD_26001, [9, 468], [10, 500]]),
      ...flat('secondary', 'bio_che_phy', [
        [1, 65],
        [2, 125],
        [3, 180],
      ]),
    ],
  },
]

export type FeeSubjectLevel = FeeLevel | 'bio_che_phy'
export type SeedSubject = { level: FeeSubjectLevel; code: string; label: string; kind: SubjectKind }

export const SEED_SUBJECTS: SeedSubject[] = [
  { level: 'primary', code: 'BMP', label: 'Bahasa Melayu Pemahaman 国文理解', kind: 'core' },
  { level: 'primary', code: 'BMK', label: 'Bahasa Melayu Karangan 国文作文', kind: 'core' },
  { level: 'primary', code: 'BC', label: 'Bahasa Cina 华文', kind: 'core' },
  { level: 'primary', code: 'MM', label: 'Mathematics 数学', kind: 'core' },
  { level: 'primary', code: 'SCI', label: 'Science 科学', kind: 'core' },
  { level: 'primary', code: 'SEJ', label: 'Sejarah 历史', kind: 'sej' },
  { level: 'primary', code: 'BIP', label: 'English Reading 英文理解', kind: 'bip' },
  { level: 'primary', code: 'BIK', label: 'English Writing 英文写作', kind: 'bik' },
  { level: 'secondary', code: 'BMP', label: 'Bahasa Melayu Pemahaman 国文理解', kind: 'core' },
  { level: 'secondary', code: 'BMK', label: 'Bahasa Melayu Karangan 国文作文', kind: 'core' },
  { level: 'secondary', code: 'BC', label: 'Bahasa Cina 华文', kind: 'core' },
  { level: 'secondary', code: 'MM', label: 'Mathematics 数学', kind: 'core' },
  { level: 'secondary', code: 'SCI', label: 'Science 科学', kind: 'core' },
  { level: 'secondary', code: 'RBT', label: 'RBT 设计与工艺', kind: 'core' },
  { level: 'secondary', code: 'SEJ', label: 'Sejarah 历史（额外加收 RM10/月）', kind: 'sej' },
  { level: 'secondary', code: 'GEO', label: 'Geografi 地理', kind: 'core' },
  { level: 'secondary', code: 'AM', label: 'A. Mathematics 高数', kind: 'core' },
  { level: 'secondary', code: 'ACC', label: 'Account 会计', kind: 'core' },
  { level: 'secondary', code: 'EKO', label: 'Ekonomi 经济学', kind: 'core' },
  { level: 'secondary', code: 'PERN', label: 'Perniagaan 商业学', kind: 'core' },
  { level: 'secondary', code: 'BIP', label: 'English Reading 英文理解', kind: 'bip' },
  { level: 'secondary', code: 'BIK', label: 'English Writing 英文写作', kind: 'bik' },
  { level: 'bio_che_phy', code: 'BIO', label: 'Biology 生物', kind: 'core' },
  { level: 'bio_che_phy', code: 'CHE', label: 'Chemistry 化学', kind: 'core' },
  { level: 'bio_che_phy', code: 'PHY', label: 'Physics 物理', kind: 'core' },
]
