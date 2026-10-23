import { describe, expect, it } from 'vitest'
import calculateChargesSource from './calculateCharges.ts?raw'
import typesSource from './types.ts?raw'
import migrationSql from '../../../supabase/migrations/20261030300000_fee_calculator.sql?raw'
import { calculateCharges, tuitionOnlyForOneMonth } from './calculateCharges'
import { DEFAULT_INVOICE_TEMPLATE, type CohortEntry, type SubjectOption } from './types'
import {
  autoTierForMonths,
  buildCohortRates,
  countSubjects,
  endMonthForTier,
  openingMonth,
  quoteFees,
  yearOptions,
  type FeeQuoteInput,
  type FeeRateRow,
} from './quote'
import { DEFAULT_GLOBAL_RATES, SEED_COHORTS, SEED_SUBJECTS } from './seed'

const rows: FeeRateRow[] = SEED_COHORTS.flatMap((cohort, index) => cohort.rates.map((rate) => ({ ...rate, cohortId: index + 1 })))
const cohorts: Record<string, CohortEntry> = Object.fromEntries(
  SEED_COHORTS.map((cohort, index) => [
    cohort.membershipName,
    {
      key: cohort.membershipName,
      label: cohort.membershipName,
      primary: buildCohortRates(rows, index + 1, 'primary'),
      secondary: buildCohortRates(rows, index + 1, 'secondary'),
      materialsIncludedInTuition: cohort.materialsIncludedInTuition,
    },
  ]),
)
const subjects = (level: 'primary' | 'secondary'): SubjectOption[] =>
  SEED_SUBJECTS.filter((s) => s.level === level).map((s) => ({ id: s.code, label: s.label, kind: s.kind }))

function quote(overrides: Partial<FeeQuoteInput> & { cohortKey: string }) {
  const level = overrides.level ?? 'primary'
  return quoteFees({
    cohort: cohorts[overrides.cohortKey],
    level,
    region: 'west_malaysia',
    rateTier: 'monthly',
    startYear: 2026,
    startMonth: 10,
    endYear: 2026,
    endMonth: 10,
    subjectList: subjects(level),
    selectedSubjects: [],
    selectedBioChePhy: [],
    anniversaryMonth: null,
    globalRates: DEFAULT_GLOBAL_RATES,
    invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
    ...overrides,
  })
}

const amounts = (q: ReturnType<typeof quote>) => q.result?.lines.map((line) => [line.type, line.amount])

describe('the maths is EC’s, unchanged', () => {
  // sha256 of EC's src/components/fee-calculator/{calculateCharges,types}.ts at commit 2b251fa (line ends as LF).
  // A different fingerprint means someone edited the copied maths: put the EC file back instead.
  const fingerprint = async (source: string) => {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.replace(/\r\n/g, '\n')))
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  it('calculateCharges.ts is byte-for-byte EC’s', async () => {
    expect(await fingerprint(calculateChargesSource)).toBe('02427356ecc5585608abae8f5bf8cc0c0647a485dabe38c14e525b719ff1e3bb')
  })

  it('types.ts (charge lines, invoice template) is byte-for-byte EC’s', async () => {
    expect(await fingerprint(typesSource)).toBe('e05a9b121293fe2c8aba6b37131fa4b6a91cca59651ab937c9d835bdf6996f77')
  })

  it('the year menu (this year -1 to +1) and the opening month only change the menus', () => {
    expect(yearOptions(new Date(2026, 9, 22))).toEqual([2025, 2026, 2027])
    expect(yearOptions(new Date(2028, 0, 1))).toEqual([2027, 2028, 2029])
    expect(openingMonth(new Date(2026, 9, 22))).toEqual({ year: 2026, month: 10 })
    // The same sum in 2028 (past EC's old 2025-2027 menu) gives the same lines as in 2026.
    const in2026 = quote({ cohortKey: '26002', selectedSubjects: ['BMP', 'BMK', 'MM'], anniversaryMonth: 10 })
    const in2028 = quote({ cohortKey: '26002', selectedSubjects: ['BMP', 'BMK', 'MM'], anniversaryMonth: 10, startYear: 2028, endYear: 2028 })
    expect(amounts(in2028)).toEqual(amounts(in2026))
    expect(in2028.invoiceText).toBe(in2026.invoiceText)
  })
})

describe('the four worked examples (docs/eduhero-fee-logic.md §9)', () => {
  it('1: 26002 primary West monthly, Oct 2026, 3 subjects, registration month 10 → RM255, next month RM180', () => {
    const q = quote({ cohortKey: '26002', selectedSubjects: ['BMP', 'BMK', 'MM'], anniversaryMonth: 10 })
    expect(q.error).toBeNull()
    expect(q.result?.lines).toEqual([
      { type: 'tuition_standard', description: '标准科目学费（3科，2026年10月，共1个月）', amount: 195 },
      { type: 'materials', description: '资料费（11月12月，3科）', amount: 30 },
      { type: 'postage', description: '西马邮费（1次）', amount: 10 },
      { type: 'registration', description: '每年报名手续费', amount: 20 },
    ])
    expect(q.result?.total).toBe(255)
    expect(q.invoiceText).toBe(
      [
        '10月 BMP+BMK+MM',
        '学费：RM195.00',
        '11月12月资料费 = RM30.00',
        '西马邮费 RM10.00',
        '每年报名手续费 RM20.00',
        '',
        'TOTAL RM255.00',
        '',
        '下个月只需付 RM180.00/月',
        '因为资料费和邮费已经付了，不需要每个月再收。',
      ].join('\n'),
    )
  })

  it('2: 26002 secondary East 3 months, Jan-Mar, 4 subjects + SEJ → RM940, next month RM315', () => {
    const q = quote({
      cohortKey: '26002',
      level: 'secondary',
      region: 'east_malaysia',
      rateTier: '3mo',
      startYear: 2027,
      startMonth: 1,
      endYear: 2027,
      endMonth: 3,
      selectedSubjects: ['BMP', 'BMK', 'BC', 'MM', 'SEJ'],
    })
    expect(amounts(q)).toEqual([
      ['tuition_standard', 870],
      ['sej_surcharge', 30],
      ['postage', 40],
    ])
    expect(q.result?.total).toBe(940)
    expect(q.invoiceText).toBe(
      [
        '1月 - 3月 BMP+BMK+BC+MM+SEJ',
        '学费：RM300 X 3 = RM900.00',
        '东马邮费 RM40.00',
        '',
        'TOTAL RM940.00',
        '',
        '下个月只需付 RM315.00/月',
        '因为邮费已经付了，不需要每个月再收。',
      ].join('\n'),
    )
  })

  it('3: 26001 primary East monthly, Oct, 2 subjects → RM154 (the parcel carries 1 + 2 = 3 months)', () => {
    const q = quote({ cohortKey: '26001', region: 'east_malaysia', selectedSubjects: ['BC', 'SCI'] })
    expect(amounts(q)).toEqual([
      ['tuition_standard', 114],
      ['materials', 20],
      ['postage', 20],
    ])
    expect(q.result?.total).toBe(154)
    // 26001 does not hold materials inside the tuition, so nothing is taken off next month.
    expect(q.invoiceText.split('\n').slice(-2)).toEqual(['下个月只需付 RM114.00/月', '因为资料费和邮费已经付了，不需要每个月再收。'])
  })

  it('4: 26002 primary West 6 months+, Aug 2026 - Jan 2027, 2 subjects, registration month 12 → RM790', () => {
    const q = quote({
      cohortKey: '26002',
      rateTier: '6mo_plus',
      startYear: 2026,
      startMonth: 8,
      endYear: 2027,
      endMonth: 1,
      selectedSubjects: ['BMP', 'MM'],
      anniversaryMonth: 12,
    })
    expect(amounts(q)).toEqual([
      ['tuition_standard', 720],
      ['materials', 20],
      ['postage', 30],
      ['registration', 20],
    ])
    expect(q.result?.lines[0].description).toBe('标准科目学费（2科，2026年8月-2027年1月，共6个月）')
    expect(q.result?.lines[2].description).toBe('西马邮费（3次）')
    expect(q.result?.total).toBe(790)
    expect(q.invoiceText).toBe(
      [
        // EC's text leaves the years out of the month range (fee-logic §10 point 1).
        '8月 - 1月 BMP+MM',
        '学费：RM120 X 6 = RM720.00',
        '2月3月资料费 = RM20.00',
        '西马邮费 RM30.00',
        '每年报名手续费 RM20.00',
        '',
        'TOTAL RM790.00',
        '',
        '下个月只需付 RM120.00/月',
        '因为资料费和邮费已经付了，不需要每个月再收。',
      ].join('\n'),
    )
  })
})

describe('edges', () => {
  it('across the new year: Nov 2026 - Feb 2027 is 4 months, 2 parcels, East bands 2 months then 2 + 1', () => {
    const q = quote({
      cohortKey: '26002',
      region: 'east_malaysia',
      startMonth: 11,
      endYear: 2027,
      endMonth: 2,
      selectedSubjects: ['BMP', 'BMK', 'MM'],
    })
    expect(q.result?.totalMonths).toBe(4)
    expect(amounts(q)).toEqual([
      ['tuition_standard', 780],
      ['materials', 15],
      ['postage', 55],
    ])
    expect(q.result?.lines[2].description).toBe('东马邮费（2次）')
  })

  it('paid up to the end of a quarter: no materials line, and nothing taken off next month', () => {
    for (const endMonth of [3, 6, 9, 12]) {
      const q = quote({ cohortKey: '26002', startMonth: endMonth, endMonth, selectedSubjects: ['MM'] })
      expect(q.result?.lines.map((line) => line.type)).toEqual(['tuition_standard', 'postage'])
      expect(q.invoiceText).toContain('下个月只需付 RM68.00/月')
      expect(q.invoiceText).toContain('因为邮费已经付了')
    }
  })

  it('a number of subjects the table does not have is an error, not a sum', () => {
    expect(() =>
      calculateCharges({
        rateTier: 'monthly',
        region: 'west_malaysia',
        startYear: 2026,
        startMonth: 10,
        endYear: 2026,
        endMonth: 10,
        standardSubjectCount: 11,
        bioChePhySubjectCount: 0,
        cambridgeSubjectCount: 0,
        hasSejarahStandalone: false,
        hasSecondarySejSurcharge: false,
        anniversaryMonth: null,
        rates: cohorts['26002'].secondary,
        globalRates: DEFAULT_GLOBAL_RATES,
      }),
    ).toThrow('找不到 11 科的标准学费收费表')
    // 26002's primary table stops at 8 subjects.
    expect(() => tuitionOnlyForOneMonth('monthly', cohorts['26002'].primary, DEFAULT_GLOBAL_RATES, 9, 0, 0, false, false)).toThrow(
      '找不到 9 科的标准学费收费表',
    )
  })

  it('the page shows the reason when a sum cannot be made', () => {
    const tooEarly = quote({ cohortKey: '26002', startMonth: 10, endMonth: 9, selectedSubjects: ['MM'] })
    expect(tooEarly.error).toBe('结束月份不能早于起始月份')
    expect(tooEarly.invoiceText).toBe('')
    const noCohort = quoteFees({ ...quoteInputWithout(), cohort: null })
    expect(noCohort.error).toBe('还没有设置收费组别，请找 Admin 到 CMS 后台加一个。')
  })

  it('the registration fee: only when its month is in the range, and once even past 12 months', () => {
    expect(quote({ cohortKey: '26002', selectedSubjects: ['MM'], anniversaryMonth: 11 }).result?.lines.map((l) => l.type)).not.toContain(
      'registration',
    )
    const long = quote({
      cohortKey: '26001',
      rateTier: '6mo_plus',
      startYear: 2026,
      startMonth: 1,
      endYear: 2027,
      endMonth: 2,
      selectedSubjects: ['MM'],
      anniversaryMonth: 1,
    })
    expect(long.result?.lines.filter((line) => line.type === 'registration')).toHaveLength(1)
    expect(long.result?.totalMonths).toBe(14)
  })

  it('East Malaysia postage by number of subjects and months in the parcel', () => {
    const east = (selectedSubjects: string[], level: 'primary' | 'secondary' = 'primary') =>
      quote({ cohortKey: '26001', level, region: 'east_malaysia', startMonth: 7, endMonth: 7, selectedSubjects }).result?.lines.find(
        (line) => line.type === 'postage',
      )?.amount
    // July: 1 month paid + 2 months of materials = a 3-month parcel.
    expect(east(['MM'])).toBe(20)
    expect(east(['MM', 'BC', 'SCI'])).toBe(30)
    expect(east(['MM', 'BC', 'SCI', 'BMP', 'BMK'])).toBe(40)
    // August to September: 2 months, paid to the end of the quarter, no materials: a 2-month parcel.
    const twoMonths = quote({
      cohortKey: '26001',
      region: 'east_malaysia',
      startMonth: 8,
      endMonth: 9,
      selectedSubjects: ['MM', 'BC', 'SCI', 'BMP', 'BMK'],
    })
    expect(twoMonths.result?.lines.find((line) => line.type === 'postage')?.amount).toBe(30)
  })
})

describe('price column and end month', () => {
  it('picks the column from the months: 1, 3 and 6-12 change it; 2, 4, 5 and 13+ keep it', () => {
    expect(autoTierForMonths(2026, 10, 2026, 10)).toBe('monthly')
    expect(autoTierForMonths(2026, 11, 2027, 1)).toBe('3mo')
    expect(autoTierForMonths(2026, 8, 2027, 1)).toBe('6mo_plus')
    expect(autoTierForMonths(2026, 1, 2026, 12)).toBe('6mo_plus')
    for (const endMonth of [2, 4, 5]) expect(autoTierForMonths(2026, 1, 2026, endMonth)).toBeNull()
    expect(autoTierForMonths(2026, 1, 2027, 1)).toBeNull()
  })

  it('picks the end month from the column', () => {
    expect(endMonthForTier('monthly', 2026, 10)).toEqual({ year: 2026, month: 10 })
    expect(endMonthForTier('3mo', 2026, 11)).toEqual({ year: 2027, month: 1 })
    expect(endMonthForTier('6mo_plus', 2026, 8)).toEqual({ year: 2027, month: 1 })
  })
})

describe('subject tracks', () => {
  it('secondary SEJ is one more standard subject plus the SEJ surcharge', () => {
    const counts = countSubjects('secondary', cohorts['26002'].secondary, subjects('secondary'), ['MM', 'SEJ'], [])
    expect(counts.standardSubjectCount).toBe(2)
    expect(counts.hasSecondarySejSurcharge).toBe(true)
  })

  it('without their own tables, primary SEJ and BIP / BIK join the standard count', () => {
    const counts = countSubjects('primary', cohorts['26001'].primary, subjects('primary'), ['MM', 'SEJ', 'BIP', 'BIK'], [])
    expect(counts).toMatchObject({ standardSubjectCount: 4, cambridgeSubjectCount: 0, hasSejarahStandalone: false })
  })

  it('a cohort with its own Sejarah and Cambridge tables prices them apart', () => {
    const extra: FeeRateRow[] = [
      ...rows.filter((row) => row.cohortId === 2),
      ...(['monthly', '3mo', '6mo_plus'] as const).map((cycleTier) => ({
        cohortId: 2,
        level: 'primary' as const,
        track: 'sejarah_standalone' as const,
        subjectCount: 1,
        cycleTier,
        amount: 30,
      })),
      ...(['monthly', '3mo', '6mo_plus'] as const).flatMap((cycleTier) => [
        { cohortId: 2, level: 'primary' as const, track: 'cambridge_english' as const, subjectCount: 1, cycleTier, amount: 50 },
        { cohortId: 2, level: 'primary' as const, track: 'cambridge_english' as const, subjectCount: 2, cycleTier, amount: 90 },
      ]),
    ]
    const rates = buildCohortRates(extra, 2, 'primary')
    const cohort: CohortEntry = { key: 'X', label: 'X', primary: rates, secondary: rates, materialsIncludedInTuition: false }
    const q = quoteFees({ ...quoteInputWithout(), cohort, selectedSubjects: ['MM', 'SEJ', 'BIP', 'BIK'] })
    expect(q.counts).toMatchObject({ standardSubjectCount: 1, cambridgeSubjectCount: 2, hasSejarahStandalone: true })
    expect(amounts(q)?.slice(0, 3)).toEqual([
      ['tuition_standard', 59],
      ['tuition_cambridge', 90],
      ['tuition_sejarah_standalone', 30],
    ])
    // Materials count all four subjects.
    expect(q.result?.lines.find((line) => line.type === 'materials')?.amount).toBe(40)
  })

  it('a Sejarah rate counts only with all three price columns', () => {
    const two = [
      { cohortId: 9, level: 'primary' as const, track: 'sejarah_standalone' as const, subjectCount: 1, cycleTier: 'monthly' as const, amount: 30 },
      { cohortId: 9, level: 'primary' as const, track: 'sejarah_standalone' as const, subjectCount: 1, cycleTier: '3mo' as const, amount: 30 },
    ]
    expect(buildCohortRates(two, 9, 'primary').sejarahStandalone).toBeUndefined()
  })

  it('BIO / CHE / PHY only for secondary, priced on their own table', () => {
    const q = quote({ cohortKey: '26002', level: 'secondary', selectedSubjects: ['MM'], selectedBioChePhy: ['BIO', 'PHY'] })
    expect(amounts(q)?.slice(0, 2)).toEqual([
      ['tuition_standard', 68],
      ['tuition_bio_che_phy', 135],
    ])
    expect(q.invoiceText.split('\n')[0]).toBe('10月 MM+BIO+PHY')
    const primary = quote({ cohortKey: '26002', selectedSubjects: ['MM'], selectedBioChePhy: ['BIO'] })
    expect(primary.counts.bioChePhySubjectCount).toBe(0)
  })
})

describe('the database starts with the same prices', () => {
  const sql = migrationSql.replace(/\r\n/g, '\n')

  it('every seeded rate is in the migration, and no other', () => {
    const block = sql.slice(sql.indexOf('-- seed: fee_rates'), sql.indexOf('-- end seed: fee_rates'))
    const found = [...block.matchAll(/\('(\d+)', '(primary|secondary)', '(\w+)', (\d+), '(\w+)', ([\d.]+)\)/g)].map(
      ([, name, level, track, count, tier, amount]) => `${name} ${level} ${track} ${count} ${tier} ${Number(amount)}`,
    )
    const expected = SEED_COHORTS.flatMap((cohort) =>
      cohort.rates.map((r) => `${cohort.membershipName} ${r.level} ${r.track} ${r.subjectCount} ${r.cycleTier} ${r.amount}`),
    )
    expect(found.sort()).toEqual(expected.sort())
  })

  it('every seeded subject is in the migration', () => {
    for (const subject of SEED_SUBJECTS) {
      expect(sql).toContain(`('${subject.level}', '${subject.code}', '${subject.label}', '${subject.kind}'`)
    }
  })

  it('the school-wide numbers and the text template are EC’s', () => {
    expect(sql).toContain(`'${JSON.stringify(DEFAULT_GLOBAL_RATES)}'`)
    expect(sql).toContain(`'${JSON.stringify(DEFAULT_INVOICE_TEMPLATE)}'`)
  })
})

function quoteInputWithout(): FeeQuoteInput {
  return {
    cohort: null,
    level: 'primary',
    region: 'west_malaysia',
    rateTier: 'monthly',
    startYear: 2026,
    startMonth: 10,
    endYear: 2026,
    endMonth: 10,
    subjectList: subjects('primary'),
    selectedSubjects: [],
    selectedBioChePhy: [],
    anniversaryMonth: null,
    globalRates: DEFAULT_GLOBAL_RATES,
    invoiceTemplate: DEFAULT_INVOICE_TEMPLATE,
  }
}
