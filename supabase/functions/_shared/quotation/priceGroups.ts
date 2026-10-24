// Price groups that follow another group (20261101520000_fee_price_group_follow.sql): a group with usesCohortId set
// uses that group's price rows and its "materials in tuition"; its own rows are ignored. Applied where the price
// tables are read (the Fee Calculator page, the quotation panel, the quotation functions), so the fee maths (EC's,
// copied byte for byte) never changes.

type Group = { id: number; materialsIncluded: boolean; usesCohortId?: number | null }
type Rate = { cohortId: number }

export function followPriceGroups<G extends Group, R extends Rate>(cohorts: G[], rates: R[]): { cohorts: G[]; rates: R[] } {
  const byId = new Map(cohorts.map((c) => [c.id, c]))
  // One step only: the followed group must have its own prices (else the follower is left as it is).
  const source = (c: G) => {
    const target = c.usesCohortId != null ? byId.get(c.usesCohortId) : undefined
    return target && (target.usesCohortId == null) && target.id !== c.id ? target : null
  }
  const followers = new Map(cohorts.filter((c) => source(c) !== null).map((c) => [c.id, source(c) as G]))
  if (followers.size === 0) return { cohorts, rates }
  return {
    cohorts: cohorts.map((c) => (followers.has(c.id) ? { ...c, materialsIncluded: (followers.get(c.id) as G).materialsIncluded } : c)),
    rates: [
      ...rates.filter((r) => !followers.has(r.cohortId)),
      ...[...followers.entries()].flatMap(([id, from]) => rates.filter((r) => r.cohortId === from.id).map((r) => ({ ...r, cohortId: id }))),
    ],
  }
}
