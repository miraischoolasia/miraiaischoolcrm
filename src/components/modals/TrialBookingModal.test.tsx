import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TrialBookingModal } from './TrialBookingModal'
import type { Lead, TrialBooking } from '../../types/domain'

const lead: Lead = {
  id: 7,
  fullName: 'Jane Tan',
  phone: '+60 12-345 6789',
  source: 'referral',
  status: 'new',
  children: [
    { name: 'Ethan', age: 9, phone: null },
    { name: 'Mia', age: 7, phone: '+60 16-000 1111' },
  ],
  notes: null,
  followUps: [],
  tasks: [],
  convertedStudentId: null,
  addedDate: '2026-09-01',
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
}

const booking: TrialBooking = {
  id: 1,
  scheduleId: 300,
  bookingDate: '2026-09-26',
  leadId: 7,
  studentId: 501,
  childName: 'Aiden',
  childAge: 9,
  phone: '+60 12-222 2222',
  notes: 'first trial',
}

function renderModal(overrides: Partial<React.ComponentProps<typeof TrialBookingModal>> = {}) {
  const props: React.ComponentProps<typeof TrialBookingModal> = {
    slotTitle: 'Trial Sat',
    teacherName: 'Ho Jia Hui',
    dateKey: '2026-09-26',
    startTime: '10:00',
    endTime: '11:00',
    bookings: [],
    leads: [lead],
    canManage: true,
    isSaving: false,
    error: null,
    onClose: vi.fn(),
    onBook: vi.fn().mockResolvedValue(true),
    onCancelBooking: vi.fn(),
    onEditSlot: vi.fn(),
    onTakeAttendance: vi.fn(),
    ...overrides,
  }
  render(<TrialBookingModal {...props} />)
  return props
}

describe('TrialBookingModal', () => {
  it('says the slot is available when nobody is booked', () => {
    renderModal()

    expect(screen.getByText('Available - nobody booked yet')).toBeInTheDocument()
  })

  it('lists everyone booked on the day and lets an admin remove one', async () => {
    const props = renderModal({ bookings: [booking, { ...booking, id: 2, childName: 'Mia' }] })

    expect(screen.getByText('2 booked')).toBeInTheDocument()
    expect(screen.getByText('Aiden')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])

    expect(props.onCancelBooking).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }))
  })

  it('books a brand-new person with name, age and phone', async () => {
    const props = renderModal()

    await userEvent.type(screen.getByLabelText('Child Name'), 'Zoe')
    await userEvent.type(screen.getByLabelText('Age'), '8')
    await userEvent.type(screen.getByLabelText('Phone'), '+60 11-999 8888')
    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))

    expect(props.onBook).toHaveBeenCalledWith({
      leadId: null,
      childName: 'Zoe',
      childAge: '8',
      phone: '+60 11-999 8888',
      notes: '',
    })
    // The form is cleared for the next child once the booking is saved.
    await waitFor(() => expect(screen.getByLabelText('Child Name')).toHaveValue(''))
  })

  it('asks for age and phone when the person is not in Leads', async () => {
    const props = renderModal()

    await userEvent.type(screen.getByLabelText('Child Name'), 'Zoe')
    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("child's age")

    await userEvent.type(screen.getByLabelText('Age'), '8')
    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('phone number')

    expect(props.onBook).not.toHaveBeenCalled()
  })

  it('finds an existing lead, prefills a chosen child and books against that lead', async () => {
    const props = renderModal()

    await userEvent.type(screen.getByPlaceholderText(/Parent name/), 'jane')
    await userEvent.click(screen.getByRole('button', { name: /Jane Tan/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Mia (7)' }))

    expect(screen.getByLabelText('Child Name')).toHaveValue('Mia')
    expect(screen.getByLabelText('Age')).toHaveValue(7)
    expect(screen.getByLabelText('Phone')).toHaveValue('+60 16-000 1111')

    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))

    expect(props.onBook).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 7, childName: 'Mia', childAge: '7' }),
    )
  })

  it('only needs a child name when booking against an existing lead', async () => {
    const props = renderModal()

    await userEvent.type(screen.getByPlaceholderText(/Parent name/), 'jane')
    await userEvent.click(screen.getByRole('button', { name: /Jane Tan/ }))
    await userEvent.type(screen.getByLabelText('Child Name'), 'Noah')
    await userEvent.click(screen.getByRole('button', { name: 'Book Trial' }))

    expect(props.onBook).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 7, childName: 'Noah', childAge: '' }),
    )
  })

  it('tells the admin when the search finds nobody so they can add them', async () => {
    renderModal()

    await userEvent.type(screen.getByPlaceholderText(/Parent name/), 'nobody here')

    expect(screen.getByText(/Not in Leads yet/)).toBeInTheDocument()
  })

  it('shows a save error from the server', () => {
    renderModal({ error: 'This child is already booked for that trial slot.' })

    expect(screen.getByRole('alert')).toHaveTextContent('already booked')
  })

  it('is read-only for teachers', () => {
    renderModal({ canManage: false, bookings: [booking] })

    expect(screen.getByText('Aiden')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Book Trial' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit Slot/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take Attendance' })).not.toBeInTheDocument()
  })

  it('offers to edit the slot or cancel the day', async () => {
    const props = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Edit Slot / Cancel This Day' }))

    expect(props.onEditSlot).toHaveBeenCalledTimes(1)
  })

  it('only offers Take Attendance once someone is booked', () => {
    renderModal({ bookings: [] })

    expect(screen.queryByRole('button', { name: 'Take Attendance' })).not.toBeInTheDocument()
  })

  it('lets an admin jump into attendance for a booked slot', async () => {
    const props = renderModal({ bookings: [booking] })

    await userEvent.click(screen.getByRole('button', { name: 'Take Attendance' }))

    expect(props.onTakeAttendance).toHaveBeenCalledTimes(1)
  })
})
