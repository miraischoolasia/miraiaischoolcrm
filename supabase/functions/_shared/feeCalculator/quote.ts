// The Fee Calculator (学费小助理) moved from the EC system (connieler96-dotcom/eduhero-crm). The owner's rule
// (2026-10-22): the fee, materials, postage and membership maths must not change by one character.
//
// calculateCharges.ts and types.ts beside this file are byte-for-byte copies of EC's
// src/components/fee-calculator/ (commit 2b251fa); feeCalculator.test.ts checks their fingerprints. Do not edit them.
// This file is the rest of the maths, which EC kept inside its page (FeeCalculatorStandalone.tsx): how the ticked
// subjects become the subject counts of each pricing track, the price column picked from the months, the end month
// picked from the price column, and the copy-paste text for the parent with "下个月只需付". Each piece is that code
// moved out of the page as it was; docs/eduhero-fee-logic.md explains it in plain words.

import {
  calculateCharges,
  formatMonthList,
  materialsMonthsInfo,
  tuitionOnlyForOneMonth,
  type CalculateChargesResult,
} from './calculateCharges.ts'
import {
  applyTemplate,
  type CohortEntry,
  type CohortRates,
  type CycleTier,
  type GlobalRates,
  type InvoiceTemplate,
  type Region,
  type SubjectOption,
  type TuitionRateTable,
} from './types.ts'

export type FeeLevel = 'primary' | 'secondary'
export type FeeTrack = 'standard' | 'bio_che_phy' | 'sejarah_standalone' | 'cambridge_english'

// One row of fee_rates: a per-month rate for one cohort, level, track, number of subjects and price column.
export type FeeRateRow = {
  cohortId: number
  level: FeeLevel
  track: FeeTrack
  subjectCount: number
  cycleTier: CycleTier
  amount: number
}

// EC's buildCohortRates (src/lib/data/fee-calculator.ts): the rate rows of one cohort and level as the tables
// calculateCharges reads. A Sejarah-standalone rate counts only when all three price columns are there.
export function buildCohortRates(rows: FeeRateRow[], cohortId: number, level: FeeLevel): CohortRates {
  const relevant = rows.filter((r) => r.cohortId === cohortId && r.level === level)
  const standard: TuitionRateTable = {}
  const bioChePhy: TuitionRateTable = {}
  const cambridgeEnglish: TuitionRateTable = {}
  let sejarahStandalone: Partial<Record<CycleTier, number>> = {}

  for (const r of relevant) {
    const amount = Number(r.amount)
    if (r.track === 'standard') {
      standard[r.subjectCount] = { ...standard[r.subjectCount], [r.cycleTier]: amount }
    } else if (r.track === 'bio_che_phy') {
      bioChePhy[r.subjectCount] = { ...bioChePhy[r.subjectCount], [r.cycleTier]: amount }
    } else if (r.track === 'cambridge_english') {
      cambridgeEnglish[r.subjectCount] = { ...cambridgeEnglish[r.subjectCount], [r.cycleTier]: amount }
    } else if (r.track === 'sejarah_standalone') {
      sejarahStandalone = { ...sejarahStandalone, [r.cycleTier]: amount }
    }
  }

  const result: CohortRates = { standard }
  if (Object.keys(bioChePhy).length > 0) result.bioChePhy = bioChePhy
  if (Object.keys(cambridgeEnglish).length > 0) result.cambridgeEnglish = cambridgeEnglish
  if (Object.keys(sejarahStandalone).length === 3) result.sejarahStandalone = sejarahStandalone as Record<CycleTier, number>
  return result
}

function round2ForText(n: number): number {
  return Math.round(n * 100) / 100
}

function monthsForTier(tier: CycleTier): number {
  return tier === 'monthly' ? 1 : tier === '3mo' ? 3 : 6
}

// deltaMonths 是从 (year, month) 再往后数几个月（0 = 就是这个月本身）
function addMonthsExclusive(year: number, month: number, deltaMonths: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + deltaMonths
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

// The price column picked when the months change: 1 month = monthly, 3 = 3 months at once, 6-12 = 6 months+;
// any other number keeps the column the consultant had (null).
export function autoTierForMonths(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): CycleTier | null {
  const totalMonths = endYear * 12 + endMonth - (startYear * 12 + startMonth) + 1
  if (totalMonths === 1) return 'monthly'
  if (totalMonths === 3) return '3mo'
  if (totalMonths >= 6 && totalMonths <= 12) return '6mo_plus'
  return null
}

// The end month picked when the price column changes: monthly = the start month, 3 months = start + 2,
// 6 months+ = start + 5. The consultant may still change it.
export function endMonthForTier(tier: CycleTier, fromYear: number, fromMonth: number): { year: number; month: number } {
  return addMonthsExclusive(fromYear, fromMonth, monthsForTier(tier) - 1)
}

// The subject counts of each pricing track, from the ticked subjects. As in EC, SEJ / BIP / BIK are found by their
// code, and every other subject counts only when its kind is "core".
export type SubjectCounts = {
  standardSubjectCount: number
  bioChePhySubjectCount: number
  cambridgeSubjectCount: number
  hasSejarahStandalone: boolean
  hasSecondarySejSurcharge: boolean
  sejarahAvailable: boolean
  cambridgeAvailable: boolean
  bioChePhyAvailable: boolean
}

export function countSubjects(
  level: FeeLevel,
  cohortRates: CohortRates | null,
  subjectList: SubjectOption[],
  selectedSubjects: string[],
  selectedBioChePhy: string[],
): SubjectCounts {
  const sejarahAvailable = level === 'primary' && !!cohortRates?.sejarahStandalone
  const cambridgeAvailable = !!cohortRates?.cambridgeEnglish
  const bioChePhyAvailable = level === 'secondary' && !!cohortRates?.bioChePhy

  const coreCount = selectedSubjects.filter((id) => subjectList.find((s) => s.id === id)?.kind === 'core').length
  const sejSelected = selectedSubjects.includes('SEJ')
  const bipSelected = selectedSubjects.includes('BIP')
  const bikSelected = selectedSubjects.includes('BIK')
  const cambridgeSelectedCount = (bipSelected ? 1 : 0) + (bikSelected ? 1 : 0)

  const hasSejarahStandalone = sejarahAvailable && sejSelected
  const cambridgeSubjectCount = cambridgeAvailable ? cambridgeSelectedCount : 0
  const hasSecondarySejSurcharge = level === 'secondary' && sejSelected

  // 如果这个组别没有独立的 Sejarah / 英文 Cambridge 表，选了 SEJ / BIP / BIK 就直接并入标准科目算
  const standardSubjectCount =
    coreCount +
    (level === 'primary' && sejSelected && !sejarahAvailable ? 1 : 0) +
    (!cambridgeAvailable ? cambridgeSelectedCount : 0) +
    (level === 'secondary' && sejSelected ? 1 : 0)

  return {
    standardSubjectCount,
    bioChePhySubjectCount: bioChePhyAvailable ? selectedBioChePhy.length : 0,
    cambridgeSubjectCount,
    hasSejarahStandalone,
    hasSecondarySejSurcharge,
    sejarahAvailable,
    cambridgeAvailable,
    bioChePhyAvailable,
  }
}

export type FeeQuoteInput = {
  cohort: CohortEntry | null
  level: FeeLevel
  region: Region
  rateTier: CycleTier
  startYear: number
  startMonth: number
  endYear: number
  endMonth: number
  subjectList: SubjectOption[]
  // In the order they were ticked (the first line of the text lists them in that order, as in EC).
  selectedSubjects: string[]
  selectedBioChePhy: string[]
  // Null when the registration fee is not charged this time.
  anniversaryMonth: number | null
  globalRates: GlobalRates
  invoiceTemplate: InvoiceTemplate
}

export type FeeQuote = {
  result: CalculateChargesResult | null
  error: string | null
  invoiceText: string
  counts: SubjectCounts
}

function monthRangeText(startMonth: number, endMonth: number, startYear: number, endYear: number): string {
  if (startYear === endYear && startMonth === endMonth) return `${startMonth}月`
  return `${startMonth}月 - ${endMonth}月`
}

// The whole page's sum: the charge lines and total, or the reason it cannot be worked out, and the text to copy.
export function quoteFees(input: FeeQuoteInput): FeeQuote {
  const cohortRates = input.cohort ? input.cohort[input.level] : null
  const counts = countSubjects(input.level, cohortRates, input.subjectList, input.selectedSubjects, input.selectedBioChePhy)
  const {
    standardSubjectCount,
    bioChePhySubjectCount,
    cambridgeSubjectCount,
    hasSejarahStandalone,
    hasSecondarySejSurcharge,
    bioChePhyAvailable,
  } = counts

  if (!cohortRates) {
    return { result: null, error: '还没有设置收费组别，请找 Admin 到 CMS 后台加一个。', invoiceText: '', counts }
  }

  let result: CalculateChargesResult
  try {
    result = calculateCharges({
      rateTier: input.rateTier,
      region: input.region,
      startYear: input.startYear,
      startMonth: input.startMonth,
      endYear: input.endYear,
      endMonth: input.endMonth,
      standardSubjectCount,
      bioChePhySubjectCount,
      cambridgeSubjectCount,
      hasSejarahStandalone,
      hasSecondarySejSurcharge,
      anniversaryMonth: input.anniversaryMonth,
      rates: cohortRates,
      globalRates: input.globalRates,
    })
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : '算不出来，请检查左边的选项', invoiceText: '', counts }
  }

  // 拆成「学费/资料费/邮费/报名费」四大类，方便文案面板分开显示
  const tuitionLines = result.lines.filter((l) => l.type !== 'materials' && l.type !== 'postage' && l.type !== 'registration')
  const tuitionTotal = tuitionLines.reduce((sum, l) => sum + l.amount, 0)
  const materialsLine = result.lines.find((l) => l.type === 'materials') ?? null
  const postageLine = result.lines.find((l) => l.type === 'postage') ?? null
  const registrationLine = result.lines.find((l) => l.type === 'registration') ?? null
  const template = input.invoiceTemplate

  const subjectCodes = [...input.selectedSubjects, ...(bioChePhyAvailable ? input.selectedBioChePhy : [])]

  const rows: string[] = []
  rows.push(`${monthRangeText(input.startMonth, input.endMonth, input.startYear, input.endYear)} ${subjectCodes.join('+')}`)
  if (result.totalMonths === 1) {
    rows.push(applyTemplate(template.tuitionSingleMonth, { amount: tuitionTotal.toFixed(2) }))
  } else {
    const perMonth = round2ForText(tuitionTotal / result.totalMonths)
    rows.push(
      applyTemplate(template.tuitionMultiMonth, {
        perMonth,
        months: result.totalMonths,
        total: tuitionTotal.toFixed(2),
      }),
    )
  }
  if (materialsLine) {
    const info = materialsMonthsInfo(input.endYear, input.endMonth)
    const monthsLabel = info ? formatMonthList(info.fromMonth, info.months) : ''
    rows.push(applyTemplate(template.materialsLine, { monthsLabel, amount: materialsLine.amount.toFixed(2) }))
  }
  if (postageLine) {
    rows.push(
      applyTemplate(template.postageLine, {
        region: input.region === 'west_malaysia' ? '西马' : '东马',
        amount: postageLine.amount.toFixed(2),
      }),
    )
  }
  if (registrationLine) {
    rows.push(applyTemplate(template.registrationLine, { amount: registrationLine.amount.toFixed(2) }))
  }
  rows.push('')
  rows.push(applyTemplate(template.totalLine, { total: result.total.toFixed(2) }))

  try {
    // 下个月已经不在这次一次性缴费的范围内了，所以要用「每月」价钱算，不能沿用
    // 这次可能用到的3个月/6个月+优惠价——那个价钱只在一次性付清那几个月时才适用。
    let nextMonthAmount = tuitionOnlyForOneMonth(
      'monthly',
      cohortRates,
      input.globalRates,
      standardSubjectCount,
      bioChePhySubjectCount,
      cambridgeSubjectCount,
      hasSejarahStandalone,
      hasSecondarySejSurcharge,
    )
    // 如果这个组别的学费本身已经包含资料费（比如26002），而这次的资料费又已经把
    // 下个月的份提前收了（materialsLine 存在），下个月的学费预览就要扣掉这部分，
    // 不然家长会被多收一次资料费。
    if (materialsLine && input.cohort?.materialsIncludedInTuition) {
      const totalSubjectCount = standardSubjectCount + bioChePhySubjectCount + cambridgeSubjectCount + (hasSejarahStandalone ? 1 : 0)
      nextMonthAmount = round2ForText(nextMonthAmount - input.globalRates.materialsFeePerSubjectPerMonth * totalSubjectCount)
    }
    rows.push('')
    rows.push(applyTemplate(template.nextMonthLine, { amount: nextMonthAmount.toFixed(2) }))
    const paidItems = [materialsLine && '资料费', postageLine && '邮费'].filter(Boolean)
    if (paidItems.length > 0) {
      rows.push(applyTemplate(template.nextMonthReason, { items: paidItems.join('和') }))
    }
  } catch {
    // 下个月预览算不出来就不显示，不影响这次的正式账单
  }

  return { result, error: null, invoiceText: rows.join('\n'), counts }
}

// Only the menus (boss 2026-10-22), not the maths: the years offered are last year, this year and next year
// (EC listed 2025-2027), and the page opens on this month (EC opened on August 2026).
export function yearOptions(today: Date): number[] {
  const year = today.getFullYear()
  return [year - 1, year, year + 1]
}

export function openingMonth(today: Date): { year: number; month: number } {
  return { year: today.getFullYear(), month: today.getMonth() + 1 }
}
