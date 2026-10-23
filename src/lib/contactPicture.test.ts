import { describe, expect, it } from 'vitest'
import { contactPictureUrl, pictureForPhone, picturesByPhone } from './contactPicture'

const STORED = 'https://wa.miraischool.asia/rails/active_storage/representations/redirect/abc/avatar.jpeg'

describe('a WhatsApp contact picture (2026-10-23)', () => {
  it('is shown from the inbox server, through this school\'s own address', () => {
    expect(contactPictureUrl(STORED, 'https://wa.miraischool.asia/api')).toBe(STORED)
    expect(contactPictureUrl(STORED, 'https://wa.eduhero.com.my/api')).toBe(
      'https://wa.eduhero.com.my/rails/active_storage/representations/redirect/abc/avatar.jpeg',
    )
  })

  it('is none when the contact has no picture, or the address is not a web address', () => {
    expect(contactPictureUrl(null, null)).toBeNull()
    expect(contactPictureUrl('', null)).toBeNull()
    expect(contactPictureUrl('   ', null)).toBeNull()
    expect(contactPictureUrl('javascript:alert(1)', null)).toBeNull()
    expect(contactPictureUrl('data:image/png;base64,AAAA', null)).toBeNull()
    expect(contactPictureUrl('http://127.0.0.1:54431/a.png', null)).toBe('http://127.0.0.1:54431/a.png')
    expect(contactPictureUrl(42, null)).toBeNull()
  })

  it('is found for a phone written any way, by its last 9 digits', () => {
    const pictures = picturesByPhone(
      [
        { phone: '+60123456789', thumbnail: STORED },
        { phone: '60198887777', thumbnail: '' },
        { phone: null, thumbnail: STORED },
      ],
      null,
    )
    expect(pictureForPhone(pictures, '012-345 6789')).toBe(STORED)
    expect(pictureForPhone(pictures, '0198887777')).toBeNull()
    expect(pictureForPhone(pictures, null)).toBeNull()
  })
})
