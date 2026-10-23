import type {
  ChargeLine,
  CohortRates,
  CycleTier,
  GlobalRates,
  MonthsBand,
  Region,
  SubjectCountBand,
} from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function subjectCountBand(count: number): SubjectCountBand {
  if (count <= 2) return "1_2";
  if (count <= 4) return "3_4";
  return "5_plus";
}

function monthsBand(months: number): MonthsBand {
  return months >= 3 ? "3" : "1_2";
}

function getQuarter(month: number): number {
  return Math.floor((month - 1) / 3) + 1; // 1-4
}

function totalMonthsBetween(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): number {
  return endYear * 12 + endMonth - (startYear * 12 + startMonth) + 1;
}

export interface MaterialsInfo {
  months: number;
  fromMonth: number;
  fromYear: number;
}

/**
 * 资料费该收哪几个月、收几个月——不管是月缴还是一次性缴费，只要是这次学费范围内
 * （起始~结束月份）的月份，资料费都已经算在那个月的学费里了，不用另外收。只算
 * 「结束月份的下一个月」到这一季结束还没被这次学费覆盖到的部分——如果结束月份刚好
 * 是这一季最后一个月（比如学费给到12月，或两个月刚好付到季底），代表这一季资料已经
 * 全部在这次的学费范围内，完全不用另外收（回传 null）。
 */
export function materialsMonthsInfo(endYear: number, endMonth: number): MaterialsInfo | null {
  const quarterEndMonth = getQuarter(endMonth) * 3;
  const leftover = quarterEndMonth - endMonth;
  if (leftover <= 0) return null;
  return { months: leftover, fromMonth: endMonth + 1, fromYear: endYear };
}

export function formatMonthList(fromMonth: number, months: number): string {
  return Array.from({ length: months }, (_, i) => `${fromMonth + i}月`).join("");
}

function formatMonthRange(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): string {
  const start = `${startYear}年${startMonth}月`;
  const end =
    startYear === endYear && startMonth === endMonth
      ? ""
      : startYear === endYear
        ? `-${endMonth}月`
        : `-${endYear}年${endMonth}月`;
  return `${start}${end}`;
}

interface QuarterTouch {
  year: number;
  quarter: number;
  monthsInThisQuarter: number; // 这次学费范围在这个季度里覆盖了几个月（用来算东马邮费的月数级距）
}

/**
 * 学费范围（起始~结束月份）横跨了哪几个季度——每跨进一个新季度，就要多寄一次邮件，
 * 所以邮费是「跨了几个季度就收几次」，不是跟学费月数直接挂钩。
 */
function quartersTouched(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
): QuarterTouch[] {
  const touches: QuarterTouch[] = [];
  let year = startYear;
  let month = startMonth;
  const endIndex = endYear * 12 + endMonth;

  while (year * 12 + month <= endIndex) {
    const quarter = getQuarter(month);
    const quarterEndMonth = quarter * 3;
    const monthsLeftInQuarter = quarterEndMonth - month + 1;
    const remainingInRange = endIndex - (year * 12 + month) + 1;
    const monthsInThisQuarter = Math.min(monthsLeftInQuarter, remainingInRange);
    touches.push({ year, quarter, monthsInThisQuarter });
    month += monthsInThisQuarter;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
  }

  return touches;
}

export interface CalculateChargesInput {
  // 学费周期：决定用哪一栏价钱（每月/一次性3个月/一次性6个月或以上），跟实际算几个月的学费是两回事
  rateTier: CycleTier;
  region: Region;
  startYear: number;
  startMonth: number; // 1-12
  endYear: number;
  endMonth: number; // 1-12，含这个月
  standardSubjectCount: number;
  bioChePhySubjectCount: number;
  cambridgeSubjectCount: number; // 0、1（BIP 或 BIK 其中一科）或 2（两科一起）
  hasSejarahStandalone: boolean;
  hasSecondarySejSurcharge: boolean;
  anniversaryMonth: number | null;
  rates: CohortRates;
  globalRates: GlobalRates;
}

export interface CalculateChargesResult {
  lines: ChargeLine[];
  total: number;
  totalMonths: number;
}

export function calculateCharges(input: CalculateChargesInput): CalculateChargesResult {
  const lines: ChargeLine[] = [];
  const rateTier = input.rateTier;

  const totalMonths = totalMonthsBetween(
    input.startYear,
    input.startMonth,
    input.endYear,
    input.endMonth
  );
  if (totalMonths < 1) {
    throw new Error("结束月份不能早于起始月份");
  }

  const monthRangeLabel = formatMonthRange(
    input.startYear,
    input.startMonth,
    input.endYear,
    input.endMonth
  );

  // --- Tuition: standard track ---
  if (input.standardSubjectCount > 0) {
    const row = input.rates.standard[input.standardSubjectCount];
    if (!row) {
      throw new Error(`找不到 ${input.standardSubjectCount} 科的标准学费收费表`);
    }
    lines.push({
      type: "tuition_standard",
      description: `标准科目学费（${input.standardSubjectCount}科，${monthRangeLabel}，共${totalMonths}个月）`,
      amount: round2(row[rateTier] * totalMonths),
    });
  }

  // --- Tuition: BIO/CHE/PHY track ---
  if (input.bioChePhySubjectCount > 0) {
    const table = input.rates.bioChePhy;
    if (!table) throw new Error("这个组别没有 BIO/CHE/PHY 收费表");
    const row = table[input.bioChePhySubjectCount];
    if (!row) {
      throw new Error(`找不到 BIO/CHE/PHY ${input.bioChePhySubjectCount} 科的收费表`);
    }
    lines.push({
      type: "tuition_bio_che_phy",
      description: `BIO/CHE/PHY 学费（${input.bioChePhySubjectCount}科，${monthRangeLabel}，共${totalMonths}个月）`,
      amount: round2(row[rateTier] * totalMonths),
    });
  }

  // --- Tuition: Cambridge English (BIP+BIK) ---
  if (input.cambridgeSubjectCount > 0) {
    const table = input.rates.cambridgeEnglish;
    if (!table) throw new Error("这个组别没有独立的英文 Cambridge 收费表");
    const row = table[input.cambridgeSubjectCount];
    if (!row) {
      throw new Error(`找不到英文 Cambridge ${input.cambridgeSubjectCount} 科的收费表`);
    }
    lines.push({
      type: "tuition_cambridge",
      description: `英文 Cambridge 学费（${input.cambridgeSubjectCount}科，${monthRangeLabel}，共${totalMonths}个月）`,
      amount: round2(row[rateTier] * totalMonths),
    });
  }

  // --- Tuition: Sejarah standalone (primary, cohort-dependent) ---
  if (input.hasSejarahStandalone) {
    const rate = input.rates.sejarahStandalone;
    if (!rate) throw new Error("这个组别没有 Sejarah 独立项目收费表");
    lines.push({
      type: "tuition_sejarah_standalone",
      description: `Sejarah 独立项目学费（${monthRangeLabel}，共${totalMonths}个月）`,
      amount: round2(rate[rateTier] * totalMonths),
    });
  }

  // --- SEJ surcharge (secondary) ---
  if (input.hasSecondarySejSurcharge) {
    lines.push({
      type: "sej_surcharge",
      description: `SEJ 额外月费（${monthRangeLabel}，共${totalMonths}个月）`,
      amount: round2(input.globalRates.sejSurchargePerMonth * totalMonths),
    });
  }

  const totalSubjectCount =
    input.standardSubjectCount +
    input.bioChePhySubjectCount +
    input.cambridgeSubjectCount +
    (input.hasSejarahStandalone ? 1 : 0);

  // --- 资料费：不管月缴还是一次性缴费都要收，是「一次性」收当季还没收过的部分
  // （见 materialsMonthsInfo 的说明；一次性缴费如果刚好付到季度最后一个月，会完全免收）。
  const materialsInfo = materialsMonthsInfo(input.endYear, input.endMonth);
  if (totalSubjectCount > 0 && materialsInfo) {
    lines.push({
      type: "materials",
      description: `资料费（${formatMonthList(materialsInfo.fromMonth, materialsInfo.months)}，${totalSubjectCount}科）`,
      amount: round2(
        input.globalRates.materialsFeePerSubjectPerMonth * totalSubjectCount * materialsInfo.months
      ),
    });
  }

  // --- 邮费：学费范围跨了几个季度就寄几次，每次一个价钱，合并成一行显示。价钱级距
  // 看的是「这次包裹里实际寄了几个月的资料」，不是单纯这次学费范围盖到的月数——
  // 最后一个触及的季度，除了学费范围本身盖到的月数，还要连同 materialsInfo 一次性
  // 补寄的月数一起算（例如只缴 10 月学费，但资料费会一次补收 11+12 月，包裹其实寄了
  // 整季 3 个月的资料，邮费要收三个月的价钱，不能只看学费范围的 1 个月）。
  if (totalSubjectCount > 0) {
    const touches = quartersTouched(input.startYear, input.startMonth, input.endYear, input.endMonth);
    let postageTotal = 0;
    touches.forEach((t, i) => {
      const isLastTouch = i === touches.length - 1;
      const monthsForBand = isLastTouch && materialsInfo ? t.monthsInThisQuarter + materialsInfo.months : t.monthsInThisQuarter;
      postageTotal +=
        input.region === "west_malaysia"
          ? input.globalRates.postage.west
          : input.globalRates.postage.east[subjectCountBand(totalSubjectCount)][monthsBand(monthsForBand)];
    });
    lines.push({
      type: "postage",
      description: `${input.region === "west_malaysia" ? "西马" : "东马"}邮费（${touches.length}次）`,
      amount: round2(postageTotal),
    });
  }

  // --- Registration fee (annual renewal, checked against the tuition window) ---
  if (input.anniversaryMonth !== null) {
    let anniversaryInWindow = false;
    for (let i = 0; i < totalMonths; i++) {
      const m = ((input.startMonth - 1 + i) % 12) + 1;
      if (m === input.anniversaryMonth) {
        anniversaryInWindow = true;
        break;
      }
    }
    if (anniversaryInWindow) {
      lines.push({
        type: "registration",
        description: "每年报名手续费",
        amount: input.globalRates.registrationFeeAmount,
      });
    }
  }

  const total = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  return { lines, total, totalMonths };
}

/**
 * 下个月大概只需要付多少：用「这次选的同一个价钱栏位」算一个月的学费，
 * 不含资料费/邮费/报名费——因为这次已经把资料费/邮费收齐了。
 */
export function tuitionOnlyForOneMonth(
  rateTier: CycleTier,
  rates: CohortRates,
  globalRates: GlobalRates,
  standardSubjectCount: number,
  bioChePhySubjectCount: number,
  cambridgeSubjectCount: number,
  hasSejarahStandalone: boolean,
  hasSecondarySejSurcharge: boolean
): number {
  let total = 0;

  if (standardSubjectCount > 0) {
    const row = rates.standard[standardSubjectCount];
    if (!row) throw new Error(`找不到 ${standardSubjectCount} 科的标准学费收费表`);
    total += row[rateTier];
  }

  if (bioChePhySubjectCount > 0) {
    const table = rates.bioChePhy;
    if (!table) throw new Error("这个组别没有 BIO/CHE/PHY 收费表");
    const row = table[bioChePhySubjectCount];
    if (!row) throw new Error(`找不到 BIO/CHE/PHY ${bioChePhySubjectCount} 科的收费表`);
    total += row[rateTier];
  }

  if (cambridgeSubjectCount > 0) {
    const table = rates.cambridgeEnglish;
    if (!table) throw new Error("这个组别没有独立的英文 Cambridge 收费表");
    const row = table[cambridgeSubjectCount];
    if (!row) throw new Error(`找不到英文 Cambridge ${cambridgeSubjectCount} 科的收费表`);
    total += row[rateTier];
  }

  if (hasSejarahStandalone) {
    const rate = rates.sejarahStandalone;
    if (!rate) throw new Error("这个组别没有 Sejarah 独立项目收费表");
    total += rate[rateTier];
  }

  if (hasSecondarySejSurcharge) {
    total += globalRates.sejSurchargePerMonth;
  }

  return round2(total);
}
