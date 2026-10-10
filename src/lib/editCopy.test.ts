import { describe, expect, it } from 'vitest'
import { isEditCopy, withoutEditHeading } from './editCopy'

describe('edit copy', () => {
  it('recognises the copy Evolution writes for an edited message', () => {
    expect(isEditCopy('\n\n`Edited Message:`\n\n那星期4 晚上5pm 呢~')).toBe(true)
    expect(isEditCopy('Hello')).toBe(false)
    expect(isEditCopy(null)).toBe(false)
  })

  it('gives back the text without the heading', () => {
    expect(withoutEditHeading('\n\n`Edited Message:`\n\n那星期4 晚上5pm 呢~')).toBe('那星期4 晚上5pm 呢~')
    expect(withoutEditHeading('Hello')).toBe('Hello')
  })
})
