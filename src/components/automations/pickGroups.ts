import type { NewBlockKind } from '../../lib/automationFlows'

export type Pick = { kind: NewBlockKind; label: string; hint: string }
export type PickGroup = { title: string; picks: Pick[] }

// Everything a "+" can add, in groups. A new kind of step is one more line here.
export const PICK_GROUPS: PickGroup[] = [
  {
    title: 'Message',
    picks: [{ kind: 'message', label: 'Send a message', hint: 'A WhatsApp message to approve' }],
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
    ],
  },
  {
    title: 'Check the lead',
    picks: [
      { kind: 'stage', label: 'Check the lead stage', hint: 'New, Contacted, ...' },
      { kind: 'source', label: 'Check the source', hint: 'Where the lead came from' },
      { kind: 'keyword', label: 'Check the source keyword', hint: 'The phrase in their first message' },
      { kind: 'tag', label: 'Check the tag', hint: 'Leads with a tag' },
      { kind: 'pic', label: 'Check the PIC', hint: 'Who handles the lead' },
      { kind: 'form', label: 'Check the form', hint: 'Which form they filled in' },
    ],
  },
]
