import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Form, Lead, TrialBooking } from '../../types/domain'
import type { HoaSlot } from '../../lib/hoaSlots'
import type { Programme } from '../../lib/programmes'
import type { WhatsAppCrm } from './crm'
import { ProgrammePanel } from './ProgrammePanel'

const api = vi.hoisted(() => ({
  fetchLeadEnrolment: vi.fn(),
  fetchLeadSteps: vi.fn(),
  saveLeadStep: vi.fn(),
  fetchForms: vi.fn(),
}))

vi.mock('../../lib/leadEnrolmentApi', async (original) => ({
  ...(await original<typeof import('../../lib/leadEnrolmentApi')>()),
  fetchLeadEnrolment: api.fetchLeadEnrolment,
}))
vi.mock('../../lib/leadProgrammeSteps', async (original) => ({
  ...(await original<typeof import('../../lib/leadProgrammeSteps')>()),
  fetchLeadSteps: api.fetchLeadSteps,
  saveLeadStep: api.saveLeadStep,
}))
vi.mock('../../lib/api', () => ({ fetchFormsFromSupabase: api.fetchForms }))

const lead = {
  id: 11,
  fullName: 'Mei Ling',
  phone: '0123456789',
  children: [{ name: 'Ethan', age: 9, phone: null }],
} as Lead

const slot: HoaSlot = {
  scheduleId: 3,
  date: '2026-10-17',
  startTime: '10:00',
  endTime: '12:00',
  title: 'Maths Sat',
  teacherName: 'Amy Lim',
  bookedCount: 2,
}

const maths: Programme = {
  id: 5,
  name: 'Maths tuition',
  legacyKey: null,
  outcome: 'booking',
  messageTemplate: '你好，{child} 的数学班：{class_time}\n报名表：{form_link}',
  isActive: true,
  sortOrder: 10,
  steps: [
    { id: 50, programmeId: 5, sortOrder: 10, kind: 'form', title: 'Sign-up form' },
    { id: 51, programmeId: 5, sortOrder: 20, kind: 'custom', title: 'Placement test' },
    { id: 52, programmeId: 5, sortOrder: 30, kind: 'class', title: 'Pick a Maths class' },
    { id: 53, programmeId: 5, sortOrder: 40, kind: 'receipt', title: 'Deposit slip' },
  ],
}

const form = { id: 'f1', name: 'Maths form', slug: 'maths', isPublished: true } as Form

function makeCrm(patch: Partial<WhatsAppCrm> = {}): WhatsAppCrm {
  return {
    canEditLeads: true,
    canBookMakeup: true,
    trialBookings: [],
    leadIdsWithForms: new Set<number>(),
    listProgrammeSlots: vi.fn(() => [slot]),
    bookingProgrammeId: () => 5,
    describeHoaBooking: () => 'Sat 17 Oct, 10:00 to 12:00',
    onBookHoa: vi.fn().mockResolvedValue(null),
    onCancelHoa: vi.fn().mockResolvedValue(null),
    onOpenFormAnswers: vi.fn(),
    ...patch,
  } as unknown as WhatsAppCrm
}

function renderPanel(crm = makeCrm(), programme = maths) {
  const onWriteMessage = vi.fn()
  render(<ProgrammePanel lead={lead} crm={crm} programme={programme} userName="Amy" onWriteMessage={onWriteMessage} />)
  return { crm, onWriteMessage }
}

describe('ProgrammePanel', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.fetchLeadEnrolment.mockResolvedValue({ receipts: [], meetings: [] })
    api.fetchLeadSteps.mockResolvedValue([])
    api.fetchForms.mockResolvedValue([form])
    api.saveLeadStep.mockImplementation(async (_lead, stepId, next) => ({
      stepId,
      done: next.done,
      note: next.note,
      date: next.date,
      updatedBy: 'Amy',
    }))
  })

  it("shows the programme's own steps, in its order and with its own names", () => {
    renderPanel()

    expect(screen.getByText('Enrol in Maths tuition')).toBeInTheDocument()
    expect(screen.getByText('0 of 4 done')).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 5 }).map((entry) => entry.textContent)
    expect(headings).toEqual(['1Sign-up form', '2Placement test', '3Pick a Maths class', '4Deposit slip'])
  })

  it('has no step the programme does not have', () => {
    renderPanel(makeCrm(), { ...maths, steps: [maths.steps[1]] })

    expect(screen.getByText('0 of 1 done')).toBeInTheDocument()
    expect(screen.queryByText('Deposit slip')).not.toBeInTheDocument()
    expect(screen.queryByText(/Zoom/)).not.toBeInTheDocument()
  })

  it('ticks a step of its own and keeps the note and date', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Done' }))

    await waitFor(() => expect(api.saveLeadStep).toHaveBeenCalledWith(11, 51, { done: true, note: '', date: '' }, 'Amy'))
    await waitFor(() => expect(screen.getByText('1 of 4 done')).toBeInTheDocument())
    expect(screen.getByText('Last changed by Amy.')).toBeInTheDocument()
  })

  it('saves the note written on a step of its own', async () => {
    renderPanel()

    await userEvent.type(screen.getByRole('textbox', { name: 'Note' }), 'Level 3')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.saveLeadStep).toHaveBeenCalledWith(11, 51, { done: false, note: 'Level 3', date: '' }, 'Amy'))
  })

  it('books a class of this programme for the child, with no age to match', async () => {
    const { crm } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Book this class' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a class first.')

    await userEvent.click(screen.getByRole('radio', { name: /Sat 17 Oct, 10:00 to 12:00/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Book this class' }))

    expect(crm.listProgrammeSlots).toHaveBeenCalledWith(5)
    await waitFor(() => expect(crm.onBookHoa).toHaveBeenCalledWith(11, slot, { name: 'Ethan', age: 9, phone: '0123456789' }))
  })

  it('counts only the bookings that belong to this programme', () => {
    const booked = { id: 5, leadId: 11, childName: 'Ethan', bookingDate: '2026-10-17', scheduleId: 3 } as TrialBooking
    const other = { id: 6, leadId: 11, childName: 'Ethan', bookingDate: '2026-10-18', scheduleId: 4 } as TrialBooking
    renderPanel(makeCrm({ trialBookings: [booked, other], bookingProgrammeId: (entry) => (entry.id === 5 ? 5 : 9) }))

    expect(screen.getAllByRole('button', { name: 'Remove Ethan from this class' })).toHaveLength(1)
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument()
  })

  it('says that enrolling as a student is not here yet for a programme that enrols', () => {
    renderPanel(makeCrm(), { ...maths, outcome: 'enrol' })

    expect(screen.getByText(/coming in the next update/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Book this class' })).not.toBeInTheDocument()
  })

  it("writes the message from the programme's own wording", async () => {
    const booked = { id: 5, leadId: 11, childName: 'Ethan', bookingDate: '2026-10-17', scheduleId: 3 } as TrialBooking
    const { onWriteMessage } = renderPanel(makeCrm({ trialBookings: [booked] }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Put the form link in the message' })).toBeEnabled())

    await userEvent.click(screen.getByRole('button', { name: 'Write the message to the parent' }))

    const text = onWriteMessage.mock.calls[0][0] as string
    expect(text).toContain('Ethan 的数学班：Sat 17 Oct, 10:00 to 12:00')
    expect(text).toContain('/?form=maths')
  })

  it('leaves out the line of a word with nothing saved', async () => {
    const { onWriteMessage } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Write the message to the parent' }))

    const text = onWriteMessage.mock.calls[0][0] as string
    // No class is booked yet, so the line with the class time is left out whole.
    expect(text).not.toContain('数学班')
    expect(text).toContain('报名表：')
    expect(text).not.toContain('{')
  })

  it('does not let a person who may not edit the lead change a step', () => {
    renderPanel(makeCrm({ canEditLeads: false }))

    expect(screen.getByRole('checkbox', { name: 'Done' })).toBeDisabled()
  })
})
