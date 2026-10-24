import type { LeadChild } from '../types/domain'
import { getLeadStages, stageLabel } from './leadStages'

// A child's own stage (the key of one of the school's stages), or the family's when the child has none yet.
export function childStageKey(child: Pick<LeadChild, 'stage'>, familyStatus: string): string {
  const own = child.stage?.trim()
  return own && getLeadStages().some((stage) => stage.key === own) ? own : familyStatus
}

// The family's stage worked out from the children (the same rule as the database, 20261102000000_child_stages.sql):
// a Lost or Converted child is not counted; of the others the child furthest behind decides; with nobody left it is
// Lost when every child is Lost, otherwise Converted. A lead whose children have no stage of their own is untouched.
export function rollupStage(children: Pick<LeadChild, 'stage'>[], familyStatus: string): string {
  if (children.length === 0 || !children.some((child) => child.stage?.trim())) {
    return familyStatus
  }
  const stages = getLeadStages()
  const order = (key: string) => stages.find((stage) => stage.key === key)?.sortOrder ?? 0
  const keys = children.map((child) => childStageKey(child, familyStatus))
  const open = keys.filter((key) => key !== 'converted' && key !== 'lost').sort((a, b) => order(a) - order(b) || a.localeCompare(b))
  if (open.length > 0) {
    return open[0]
  }
  return keys.every((key) => key === 'lost') ? 'lost' : 'converted'
}

// The children whose stage is not the one the family shows, with their stage's name, for "+N".
export function otherChildStages(children: Pick<LeadChild, 'name' | 'stage'>[], familyStatus: string) {
  return children
    .map((child, index) => ({ name: child.name?.trim() || `Child ${index + 1}`, key: childStageKey(child, familyStatus) }))
    .filter((entry) => entry.key !== familyStatus)
    .map((entry) => ({ ...entry, label: stageLabel(entry.key) }))
}
