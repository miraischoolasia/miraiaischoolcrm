import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassCategoriesSettings } from './ClassCategoriesSettings'
import { defaultClassCategories, resetClassCategoriesForTests, type ClassCategory } from '../lib/classCategories'

const school: ClassCategory[] = [
  { name: 'Regular Class', kind: 'regular', sortOrder: 10, isActive: true },
  { name: 'Trial Class', kind: 'trial', sortOrder: 20, isActive: true },
]

// A fixed list: the tests never read the real database.
beforeEach(() => resetClassCategoriesForTests(defaultClassCategories, false))
afterEach(() => resetClassCategoriesForTests(defaultClassCategories, false))

describe('Class categories in Class Settings', () => {
  it('adds a category that works like a chosen kind', async () => {
    resetClassCategoriesForTests(school, true)
    const save = vi.fn().mockResolvedValue(null)
    render(<ClassCategoriesSettings save={save} />)
    await userEvent.type(screen.getByLabelText('New class category name'), 'Exam Prep')
    await userEvent.selectOptions(screen.getByLabelText('New class category works like'), 'camp')
    await userEvent.click(screen.getByRole('button', { name: 'Add class category' }))
    expect(save).toHaveBeenCalledWith(null, { name: 'Exam Prep', kind: 'camp' })
  })

  it('renames, hides and reorders', async () => {
    resetClassCategoriesForTests(school, true)
    const save = vi.fn().mockResolvedValue(null)
    render(<ClassCategoriesSettings save={save} />)
    const name = screen.getByLabelText('Trial Class name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Free Trial')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(save).toHaveBeenCalledWith(school[1], { name: 'Free Trial' })

    await userEvent.click(screen.getByRole('button', { name: 'Hide Regular Class' }))
    expect(save).toHaveBeenCalledWith(school[0], { isActive: false })

    await userEvent.click(screen.getByRole('button', { name: 'Move Trial Class up' }))
    expect(save).toHaveBeenCalledWith(school[1], { sortOrder: 10 })
  })

  it('asks before a category starts working like another kind', async () => {
    resetClassCategoriesForTests(school, true)
    const save = vi.fn().mockResolvedValue(null)
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirm)
    render(<ClassCategoriesSettings save={save} />)
    await userEvent.selectOptions(screen.getByLabelText('Trial Class works like'), 'regular')
    expect(save).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByLabelText('Trial Class works like'), 'regular')
    expect(save).toHaveBeenCalledWith(school[1], { kind: 'regular' })
    vi.unstubAllGlobals()
  })

  it('shows the usual three, locked, before the database update', () => {
    resetClassCategoriesForTests(defaultClassCategories, false)
    render(<ClassCategoriesSettings save={vi.fn()} />)
    expect(screen.getByText(/after the database update/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add class category' })).toBeDisabled()
  })
})
