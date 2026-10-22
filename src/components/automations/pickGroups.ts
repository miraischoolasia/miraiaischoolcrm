import { SOURCE_KEYWORD_ACTIONS, type ActionKind, type FlowTrigger, type NewBlockKind } from '../../lib/automationFlows'

// onlyFor: the triggers where the pick means something (left out = every trigger).
export type Pick = { kind: NewBlockKind; label: string; hint: string; onlyFor?: FlowTrigger[] }
export type PickGroup = { title: string; picks: Pick[] }

// Everything a "+" can add, in groups. A new kind of step is one more line here.
export const PICK_GROUPS: PickGroup[] = [
  {
    title: 'Message',
    picks: [{ kind: 'message', label: 'Send a message', hint: 'A WhatsApp message to approve' }],
  },
  {
    title: 'Change the lead',
    picks: [
      { kind: 'make_lead', label: 'Make them a lead', hint: 'For a flow that starts from a message' },
      { kind: 'add_tag', label: 'Add a tag', hint: 'Put a tag on the lead' },
      { kind: 'remove_tag', label: 'Remove a tag', hint: 'Take a tag off the lead' },
      { kind: 'set_source', label: 'Set the source', hint: 'Change the lead’s source' },
      { kind: 'assign_pic', label: 'Assign a PIC', hint: 'Who handles the lead from now on' },
      { kind: 'set_stage', label: 'Change the lead stage', hint: 'Move the lead to another stage' },
    ],
  },
  {
    title: 'Tell the team',
    picks: [
      { kind: 'notify_staff', label: 'Notify staff', hint: 'A note under the bell for the PIC or the teachers' },
      { kind: 'create_task', label: 'Create a follow-up task', hint: 'A task in the Calendar with a due day' },
    ],
  },
  {
    title: 'Wait for the parent',
    picks: [
      { kind: 'wait', label: 'Wait for a reply', hint: 'Replied in time, or no reply' },
      { kind: 'reply', label: 'Check what the reply says', hint: 'Words in the parent’s reply' },
    ],
  },
  {
    title: 'Check the child',
    picks: [
      { kind: 'age', label: 'Check the age', hint: 'Split by the child’s age' },
      { kind: 'classroom', label: 'Check the class', hint: 'Split by the class' },
      { kind: 'hours', label: 'Check lessons left', hint: 'Children nearly out of lessons' },
      { kind: 'hours_is', label: 'Lessons left is exactly', hint: 'For example exactly 3 left', onlyFor: ['lessons_left'] },
      { kind: 'subject', label: 'Lead or student', hint: 'Still a lead, or already a student' },
      { kind: 'student_kind', label: 'Check the student kind', hint: 'The kinds set on the Students page' },
      { kind: 'absent_streak', label: 'Absent in a row', hint: 'Missed 2 or more lessons in a row', onlyFor: ['class_absent'] },
      { kind: 'att_status', label: 'Check the absence kind', hint: 'Absent, sick leave, ...', onlyFor: ['class_absent'] },
    ],
  },
  {
    title: 'Check the lead',
    picks: [
      { kind: 'stage', label: 'Check the lead stage', hint: 'New, Contacted, ...' },
      { kind: 'source', label: 'Check the source', hint: 'Where the lead came from' },
      { kind: 'keyword', label: 'Check the source keyword', hint: 'The phrase in their first message' },
      { kind: 'tag', label: 'Check the tag', hint: 'Leads with a tag' },
      { kind: 'tag_not', label: 'Does not have a tag', hint: 'Leads without a tag' },
      { kind: 'tag_added', label: 'Check which tag was added', hint: 'The tag that started the flow', onlyFor: ['lead_tag'] },
      { kind: 'pic', label: 'Check the PIC', hint: 'Who handles the lead' },
      { kind: 'form', label: 'Check the form', hint: 'Which form they filled in' },
    ],
  },
  {
    title: 'Check the time',
    picks: [{ kind: 'weekday', label: 'Day and time', hint: 'Only on some days or hours' }],
  },
]

// The groups for a flow with this trigger: picks that mean nothing for it are left out.
// A source keyword flow only makes the lead, sets the source and adds tags.
export function pickGroupsFor(trigger: FlowTrigger | undefined): PickGroup[] {
  const fits = (pick: Pick) =>
    trigger === 'first_message_keyword'
      ? SOURCE_KEYWORD_ACTIONS.includes(pick.kind as ActionKind)
      : !pick.onlyFor || trigger === undefined || pick.onlyFor.includes(trigger)
  return PICK_GROUPS.map((group) => ({ ...group, picks: group.picks.filter(fits) })).filter((group) => group.picks.length > 0)
}
