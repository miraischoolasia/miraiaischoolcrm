import { describe, expect, it } from 'vitest'
import { channelAvatarError, channelKeyOf, facebookPictureUrl, mainPageOf } from './channelAvatars'

describe('channel pictures', () => {
  it('names a channel by its inbox, and by its Page when the inbox carries several', () => {
    expect(channelKeyOf(7)).toBe('7')
    expect(channelKeyOf(7, '  EduHero Online ')).toBe('7|eduheroonline')
    // The same Page written with other spaces, width or case is one Page.
    expect(channelKeyOf(7, 'EduHero  Online')).toBe(channelKeyOf(7, 'ＥduHero Online'))
    expect(channelKeyOf(8, '万能教 Jack老师')).toBe(channelKeyOf(8, '万能教Jack' + String.fromCharCode(0x200b) + ' 老师'))
    expect(channelKeyOf(7, '')).toBe('7')
    expect(channelKeyOf(undefined, null)).toBe('0')
  })

  it("takes the Page that has the inbox's name, even when another Page has as many or more chats", () => {
    const names = new Map([
      ['111', 'EduHero 英雄教育 Online'],
      ['222', '万能教 Jack老师'],
    ])

    // A tie of 9 and 9 (inbox 4 on EduHero): the name decides, whichever is listed first.
    expect(mainPageOf(new Map([['222', 9], ['111', 9]]), names, 'EduHero 英雄教育 Online')).toBe('111')
    expect(mainPageOf(new Map([['111', 2], ['222', 30]]), names, 'EduHero 英雄教育 online')).toBe('111')
    // No Page has the inbox's name: the one with the most chats.
    expect(mainPageOf(new Map([['111', 2], ['222', 30]]), names, 'Messenger inbox')).toBe('222')
    expect(mainPageOf(new Map(), names, 'x')).toBeNull()
  })

  it("links a Facebook Page's public picture by its id", () => {
    expect(facebookPictureUrl('1234567890')).toBe('https://graph.facebook.com/1234567890/picture?type=square&width=96&height=96')
    expect(facebookPictureUrl('a b')).toContain('/a%20b/')
  })

  it('words the database errors for a person', () => {
    expect(channelAvatarError({ message: 'relation "public.channel_avatars" does not exist' }, 'x')).toBe(
      'Channel pictures are not set up in the database yet.',
    )
    expect(channelAvatarError({ message: 'new row violates row-level security policy' }, 'x')).toBe(
      'Only an admin can change the pictures.',
    )
    expect(channelAvatarError({}, 'fallback')).toBe('fallback')
  })
})
