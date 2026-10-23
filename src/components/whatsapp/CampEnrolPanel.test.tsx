import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Classroom, Form, Lead, LeadFormSubmission, Package, Student } from '../../types/domain'
import type { WhatsAppCrm } from './crm'
import { CampEnrolPanel } from './CampEnrolPanel'

const api = vi.hoisted(() => ({
  fetchLeadEnrolment: vi.fn(),
  addLeadReceipt: vi.fn(),
  addLeadZoomMeeting: vi.fn(),
  updateLeadZoomMeeting: vi.fn(),
  fetchForms: vi.fn(),
}))

vi.mock('../../lib/leadEnrolmentApi', async (original) => ({
  ...(await original<typeof import('../../lib/leadEnrolmentApi')>()),
  fetchLeadEnrolment: api.fetchLeadEnrolment,
  addLeadReceipt: api.addLeadReceipt,
  addLeadZoomMeeting: api.addLeadZoomMeeting,
  updateLeadZoomMeeting: api.updateLeadZoomMeeting,
}))
vi.mock('../../lib/api', () => ({ fetchFormsFromSupabase: api.fetchForms }))

const lead = {
  id: 11,
  fullName: 'Mei Ling',
  phone: '0123456789',
  children: [{ name: 'Ethan', age: 9, phone: null }],
} as Lead

const campPackage = { id: 5, name: 'Holiday Camp', kind: 'camp', classCount: 12, durationMonths: 3, includesFees: false, isActive: true, sortOrder: 50 } as Package
const campClass = { id: 30, name: 'Camp Monday', category: 'camp', status: 'active' } as Classroom
const campForm = { id: 'f2', name: 'Mirai Holiday Camp registration', slug: 'camp', isPublished: true } as Form
const hoaForm = { id: 'f1', name: 'Eduhero HOA registration', slug: 'hoa', isPublished: true } as Form

function makeCrm(patch: Partial<WhatsAppCrm> = {}): WhatsAppCrm {
  return {
    canEditLeads: true,
    packages: [campPackage],
    classrooms: [campClass],
    students: [],
    leadIdsWithForms: new Set<number>(),
    loadFormAnswers: vi.fn().mockResolvedValue([]),
    onEnrolCamp: vi.fn().mockResolvedValue(null),
    onOpenFormAnswers: vi.fn(),
    onOpenStudent: vi.fn(),
    ...patch,
  } as unknown as WhatsAppCrm
}

function renderPanel(crm = makeCrm()) {
  const onWriteMessage = vi.fn()
  render(<CampEnrolPanel lead={lead} crm={crm} userName="Amy" onWriteMessage={onWriteMessage} />)
  return { crm, onWriteMessage }
}

describe('CampEnrolPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.fetchLeadEnrolment.mockResolvedValue({ receipts: [], meetings: [] })
    api.fetchForms.mockResolvedValue([hoaForm, campForm])
    api.addLeadReceipt.mockResolvedValue(undefined)
    api.addLeadZoomMeeting.mockResolvedValue(undefined)
  })

  it('starts with nothing done and picks the form named after the camp', async () => {
    const { onWriteMessage } = renderPanel()

    expect(screen.getByText('0 of 4 done')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Put the form link in the message' }))

    expect(onWriteMessage).toHaveBeenCalledWith(expect.stringContaining('/?form=camp'))
  })

  it('says so when there is no camp class yet', () => {
    renderPanel(makeCrm({ classrooms: [] }))

    expect(screen.getByText(/There is no Holiday Camp class yet/)).toBeInTheDocument()
  })

  it('enrols the child in the picked class from the start date, with the camp package', async () => {
    const { crm } = renderPanel()

    await userEvent.click(screen.getByRole('radio', { name: /Camp Monday/ }))
    await userEvent.clear(screen.getByLabelText('Starts on'))
    await userEvent.type(screen.getByLabelText('Starts on'), '2026-11-02')
    expect(screen.getByText(/12 classes, until/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enrol in the Holiday Camp' }))

    await waitFor(() =>
      expect(crm.onEnrolCamp).toHaveBeenCalledWith({
        leadId: 11,
        childName: 'Ethan',
        phone: '0123456789',
        classroomId: 30,
        packageId: 5,
        startDate: '2026-11-02',
      }),
    )
  })

  it('shows a child who is already on the camp package, and does not offer to enrol them again', () => {
    const student = {
      id: 7,
      name: 'Ethan',
      phone: '0123456789',
      packageId: 5,
      classroomId: 30,
      lessonExpiryDate: '2027-02-02',
      remainingHours: 12,
    } as Student
    renderPanel(makeCrm({ students: [student] }))

    expect(screen.getByText(/Camp Monday · until/)).toBeInTheDocument()
    expect(screen.getByText('Ethan is already in the camp.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enrol in the Holiday Camp' })).not.toBeInTheDocument()
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument()
  })

  it('does not count an HOA form as the camp form', async () => {
    const hoaSubmission = { id: 1, formId: 'f1', formName: 'Eduhero HOA registration' } as LeadFormSubmission
    renderPanel(makeCrm({ leadIdsWithForms: new Set([11]), loadFormAnswers: vi.fn().mockResolvedValue([hoaSubmission]) }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Put the form link in the message' })).toBeEnabled())
    expect(screen.queryByText('The parent has filled it in.')).not.toBeInTheDocument()
  })

  it('writes the message with the class and start date', async () => {
    const student = {
      id: 7,
      name: 'Ethan',
      phone: '0123456789',
      packageId: 5,
      classroomId: 30,
      lessonExpiryDate: '2027-02-02',
      remainingHours: 12,
    } as Student
    const { onWriteMessage } = renderPanel(makeCrm({ students: [student] }))

    await userEvent.click(screen.getByRole('button', { name: 'Write the message to the parent' }))

    const text = onWriteMessage.mock.calls[0][0] as string
    expect(text).toContain('Ethan')
    expect(text).toContain('Holiday Camp')
    expect(text).toContain('Camp Monday')
    expect(text).toContain('12')
  })
})
