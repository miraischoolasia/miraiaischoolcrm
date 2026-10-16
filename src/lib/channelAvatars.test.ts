import { describe, expect, it } from 'vitest'
import { channelAvatarError, channelKeyOf, facebookPictureUrl } from './channelAvatars'

describe('channel pictures', () => {
  it('names a channel by its inbox, and by its Page when the inbox carries several', () => {
    expect(channelKeyOf(7)).toBe('7')
    expect(channelKeyOf(7, '  EduHero Online ')).toBe('7|EduHero Online')
    expect(channelKeyOf(7, '')).toBe('7')
    expect(channelKeyOf(undefined, null)).toBe('0')
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
