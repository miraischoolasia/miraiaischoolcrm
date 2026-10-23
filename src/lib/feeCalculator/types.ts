export type CycleTier = "monthly" | "3mo" | "6mo_plus";
export type Region = "west_malaysia" | "east_malaysia";
export type Level = "primary" | "secondary";
export type SubjectCountBand = "1_2" | "3_4" | "5_plus";
export type MonthsBand = "1_2" | "3";

/** A single line in a student's 应收 (amount due) breakdown. */
export interface ChargeLine {
  type:
    | "tuition_standard"
    | "tuition_bio_che_phy"
    | "tuition_sejarah_standalone"
    | "tuition_cambridge"
    | "sej_surcharge"
    | "materials"
    | "postage"
    | "registration";
  description: string;
  amount: number;
}

/** One cohort's tuition rate table for one subject-pricing track (standard, or bio/che/phy). */
export type TuitionRateTable = Record<number, Record<CycleTier, number>>; // subjectCount -> per-month rate by cycle tier

export interface CohortRates {
  standard: TuitionRateTable;
  bioChePhy?: TuitionRateTable; // secondary only
  sejarahStandalone?: Record<CycleTier, number>; // primary only, only if this cohort keeps it separate
  cambridgeEnglish?: TuitionRateTable; // BIP+BIK, keyed 1 (either one) / 2 (both together) — only if this cohort keeps it separate from standard
}

export interface PostageRateTable {
  west: number; // flat per shipment
  east: Record<SubjectCountBand, Record<MonthsBand, number>>;
}

export interface GlobalRates {
  materialsFeePerSubjectPerMonth: number;
  postage: PostageRateTable;
  registrationFeeAmount: number;
  sejSurchargePerMonth: number; // secondary SEJ only
}

export interface CohortEntry {
  key: string;
  label: string;
  primary: CohortRates;
  secondary: CohortRates;
  /** True when this cohort's per-subject tuition rate already has materials fee baked in
   * (e.g. 26002) — the "next month" preview needs to subtract materials for the upcoming
   * month whenever this invoice pre-collected it via the materials line, otherwise the
   * family would be charged materials twice. False cohorts (e.g. 26001) bill materials as a
   * fully separate quarterly item, so no subtraction is needed. */
  materialsIncludedInTuition: boolean;
}

export type SubjectKind = "core" | "sej" | "bip" | "bik";
export interface SubjectOption {
  id: string;
  label: string;
  kind: SubjectKind;
}

/** Copy-paste invoice text line templates — {tokens} get substituted at render time. */
export interface InvoiceTemplate {
  tuitionSingleMonth: string; // {amount}
  tuitionMultiMonth: string; // {perMonth} {months} {total}
  materialsLine: string; // {monthsLabel} {amount}
  postageLine: string; // {region} {amount}
  registrationLine: string; // {amount}
  totalLine: string; // {total}
  nextMonthLine: string; // {amount}
  nextMonthReason: string; // {items}
}

export const DEFAULT_INVOICE_TEMPLATE: InvoiceTemplate = {
  tuitionSingleMonth: "学费：RM{amount}",
  tuitionMultiMonth: "学费：RM{perMonth} X {months} = RM{total}",
  materialsLine: "{monthsLabel}资料费 = RM{amount}",
  postageLine: "{region}邮费 RM{amount}",
  registrationLine: "每年报名手续费 RM{amount}",
  totalLine: "TOTAL RM{total}",
  nextMonthLine: "下个月只需付 RM{amount}/月",
  nextMonthReason: "因为{items}已经付了，不需要每个月再收。",
};

export function applyTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}
