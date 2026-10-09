import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Form, Lead, TrialBooking } from '../../types/domain'
import type { HoaSlot } from '../../lib/hoaSlots'
import type { WhatsAppCrm } from './crm'
import { EnrolPanel } from './EnrolPanel'

const api = vi.hoisted(() => ({
  fetchLeadEnrolment: vi.fn(),
  addLeadReceipt: vi.fn(),
  deleteLeadReceipt: vi.fn(),
  receiptLink: vi.fn(),
  addLeadZoomMeeting: vi.fn(),
  deleteLeadZoomMeeting: vi.fn(),
  fetchForms: vi.fn(),
}))

vi.mock('../../lib/leadEnrolmentApi', async (original) => ({
  ...(await original<typeof import('../../lib/leadEnrolmentApi')>()),
  fetchLeadEnrolment: api.fetchLeadEnrolment,
  addLeadReceipt: api.addLeadReceipt,
  deleteLeadReceipt: api.deleteLeadReceipt,
  receiptLink: api.receiptLink,
  addLeadZoomMeeting: api.addLeadZoomMeeting,
  deleteLeadZoomMeeting: api.deleteLeadZoomMeeting,
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
  title: 'HOA Saturday',
  teacherName: 'Amy Lim',
  bookedCount: 1,
}

const hoaForm = { id: 'f1', name: 'Eduhero HOA registration', slug: 'hoa', isPublished: true } as Form

function makeCrm(patch: Partial<WhatsAppCrm> = {}): WhatsAppCrm {
  return {
    canEditLeads: true,
    canBookMakeup: true,
    trialBookings: [],
    leadIdsWithForms: new Set<number>(),
    listHoaSlots: () => [slot],
    describeHoaBooking: () => 'Sat 17 Oct, 10:00 to 12:00',
    onBookHoa: vi.fn().mockResolvedValue(null),
    onCancelHoa: vi.fn().mockResolvedValue(null),
    onOpenFormAnswers: vi.fn(),
    ...patch,
  } as unknown as WhatsAppCrm
}

function renderPanel(crm = makeCrm()) {
  const onWriteMessage = vi.fn()
  render(<EnrolPanel lead={lead} crm={crm} userName="Amy" onWriteMessage={onWriteMessage} />)
  return { crm, onWriteMessage }
}

describe('EnrolPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.fetchLeadEnrolment.mockResolvedValue({ receipts: [], meetings: [] })
    api.fetchForms.mockResolvedValue([hoaForm])
    api.addLeadReceipt.mockResolvedValue(undefined)
    api.addLeadZoomMeeting.mockResolvedValue(undefined)
  })

  it('starts with nothing done and says the form is not in yet', async () => {
    renderPanel()

    expect(screen.getByText('0 of 4 done')).toBeInTheDocument()
    expect(screen.getByText(/Not filled in yet/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Put the form link in the message' })).toBeEnabled())
  })

  it('puts the form link in the message box', async () => {
    const { onWriteMessage } = renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Put the form link in the message' }))

    expect(onWriteMessage).toHaveBeenCalledWith(expect.stringContaining('/?form=hoa'))
  })

  it('shows when the parent has filled in the form, and opens their answers', async () => {
    const { crm } = renderPanel(makeCrm({ leadIdsWithForms: new Set([11]) }))

    expect(screen.getByText('The parent has filled it in.')).toBeInTheDocument()
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Read their answers' }))
    expect(crm.onOpenFormAnswers).toHaveBeenCalledWith(11)
  })

  it('books the picked class for the child', async () => {
    const { crm } = renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Book this class' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a class first.')

    await userEvent.click(screen.getByRole('radio', { name: /Sat 17 Oct, 10:00 to 12:00/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Book this class' }))

    await waitFor(() => expect(crm.onBookHoa).toHaveBeenCalledWith(11, slot, { name: 'Ethan', age: 9, phone: '0123456789' }))
  })

  it('lists a class that is already booked, and counts the step as done', () => {
    const booked = { id: 5, leadId: 11, childName: 'Ethan', bookingDate: '2026-10-17', scheduleId: 3 } as TrialBooking
    renderPanel(makeCrm({ trialBookings: [booked] }))

    expect(screen.getByRole('button', { name: 'Remove Ethan from this class' })).toBeInTheDocument()
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument()
  })

  it('keeps a PDF receipt for the lead', async () => {
    renderPanel()
    const file = new File(['%PDF-1.4'], 'slip.pdf', { type: 'application/pdf' })

    await userEvent.upload(screen.getByLabelText(/Upload the receipt/), file)

    await waitFor(() => expect(api.addLeadReceipt).toHaveBeenCalledWith(11, file, 'Amy'))
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('turns away a file that is not a PDF or a photo', async () => {
    renderPanel()

    await userEvent.upload(
      screen.getByLabelText(/Upload the receipt/),
      new File(['x'], 'slip.docx', { type: 'application/msword' }),
      { applyAccept: false },
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a PDF or a photo')
    expect(api.addLeadReceipt).not.toHaveBeenCalled()
  })

  it('asks for a real date and link before saving a Zoom meeting, then saves it', async () => {
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Save the Zoom meeting' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Pick the date and time')

    await userEvent.type(screen.getByLabelText('Date and time'), '2026-10-16T20:30')
    await userEvent.type(screen.getByLabelText(/Zoom link/), 'not a link')
    await userEvent.click(screen.getByRole('button', { name: 'Save the Zoom meeting' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Paste the Zoom link')

    await userEvent.clear(screen.getByLabelText(/Zoom link/))
    await userEvent.type(screen.getByLabelText(/Zoom link/), 'https://zoom.us/j/123')
    await userEvent.click(screen.getByRole('button', { name: 'Save the Zoom meeting' }))

    await waitFor(() => expect(api.addLeadZoomMeeting).toHaveBeenCalledTimes(1))
    expect(api.addLeadZoomMeeting.mock.calls[0][0]).toBe(11)
    expect(api.addLeadZoomMeeting.mock.calls[0][2]).toBe('https://zoom.us/j/123')
  })

  it('writes the message from what is saved', async () => {
    api.fetchLeadEnrolment.mockResolvedValue({
      receipts: [{ id: 1, leadId: 11, path: 'p', name: 'slip.pdf', size: 10, addedBy: 'Amy', createdAt: '2026-10-09T01:00:00Z' }],
      meetings: [{ id: 2, leadId: 11, startsAt: new Date(2026, 9, 16, 20, 30).toISOString(), link: 'https://zoom.us/j/9', addedBy: 'Amy' }],
    })
    const booked = { id: 5, leadId: 11, childName: 'Ethan', bookingDate: '2099-10-17', scheduleId: 3 } as TrialBooking
    const { onWriteMessage } = renderPanel(makeCrm({ trialBookings: [booked], leadIdsWithForms: new Set([11]) }))
    await screen.findByText('slip.pdf')

    await userEvent.click(screen.getByRole('button', { name: 'Write the message to the parent' }))

    const text = onWriteMessage.mock.calls[0][0] as string
    expect(text).toContain('已收到款项')
    expect(text).toContain('Ethan 的 HOA 课程已经安排在 Sat 17 Oct, 10:00 to 12:00')
    expect(text).toContain('https://zoom.us/j/9')
    // The form is already in, so it is not asked for again.
    expect(text).not.toContain('报名表')
  })

  it('only lets people who may edit leads change anything', () => {
    renderPanel(makeCrm({ canEditLeads: false, canBookMakeup: false }))

    expect(screen.queryByRole('button', { name: 'Book this class' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Upload the receipt/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save the Zoom meeting' })).not.toBeInTheDocument()
  })
  it('shows the class for the age of the child first, and the others when asked', async () => {
    const eleven: HoaSlot = { ...slot, scheduleId: 4, title: 'HOA 【12-14 Years Old 】' }
    const nine: HoaSlot = { ...slot, scheduleId: 5, title: 'HOA 【6-9 Years Old 】' }
    renderPanel(makeCrm({ listHoaSlots: () => [eleven, nine] }))

    // Ethan is 9.
    expect(screen.getAllByRole('radio')).toHaveLength(1)
    expect(screen.getByText(/HOA 6-9 Years Old/)).toBeInTheDocument()
    expect(screen.queryByText(/HOA 12-14 Years Old/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Show classes for other ages too'))
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

})
