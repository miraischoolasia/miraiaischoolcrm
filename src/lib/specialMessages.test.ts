import { describe, expect, it } from 'vitest'
import { isSticker, parseSpecialMessage, summarizeMessage } from './specialMessages'

describe('parseSpecialMessage', () => {
  it('reads a shared contact with every number', () => {
    expect(parseSpecialMessage('**Contact:**\n\n*Name:* Yun\n*Number (1):* +60 11-5772 5709\n*Number (2):* +60 12-111 2222')).toEqual({
      kind: 'contact',
      name: 'Yun',
      numbers: ['+60 11-5772 5709', '+60 12-111 2222'],
    })
  })

  it('reads a shared location with its name, address and map link', () => {
    const text =
      '*Location:*\n\n_Latitude:_ 3.139 \n_Longitude:_ 101.6869 \n_Location Name:_ Mirai School\n_Location Address:_ Jalan 1, KL \n_Location URL:_ https://www.google.com/maps/search/?api=1&query=3.139,101.6869'
    expect(parseSpecialMessage(text)).toEqual({
      kind: 'location',
      lat: '3.139',
      lng: '101.6869',
      name: 'Mirai School',
      address: 'Jalan 1, KL',
      url: 'https://www.google.com/maps/search/?api=1&query=3.139,101.6869',
    })
  })

  it('shows a plain message as it is, even one with a map link in a sentence', () => {
    expect(parseSpecialMessage('Hello')).toBeNull()
    expect(parseSpecialMessage('Meet here https://www.google.com/maps/search/?api=1&query=3.1,101.6')).toBeNull()
    expect(parseSpecialMessage(null)).toBeNull()
  })
})

describe('isSticker', () => {
  it('tells a sticker (webp) from a photo', () => {
    expect(isSticker({ file_type: 'image', extension: 'webp', data_url: 'x/a' })).toBe(true)
    expect(isSticker({ file_type: 'image', data_url: 'https://x/blob/abc/a.webp?x=1' })).toBe(true)
    expect(isSticker({ file_type: 'image', extension: 'jpg', data_url: 'x/a.jpg' })).toBe(false)
    expect(isSticker({ file_type: 'video', extension: 'webp', data_url: 'x/a' })).toBe(false)
  })
})

describe('summarizeMessage', () => {
  it('turns a card into one plain line and leaves other text as it is', () => {
    expect(summarizeMessage('**Contact:**\n\n*Name:* Yun\n*Number (1):* +60 11-5772 5709')).toBe('Contact: Yun')
    expect(summarizeMessage('*Poll:* Which day?\n1. Sat\n2. Sun')).toBe('Poll: Which day?')
    expect(summarizeMessage('  Hello  ')).toBe('Hello')
    expect(summarizeMessage(null)).toBe('')
  })
})
