import { describe, expect, it } from 'vitest'
import type { ChatwootMessage } from './whatsappInbox'
import { detectChatRole } from './studentReply'

const said = (content: string, type: 0 | 1 = 0): ChatwootMessage =>
  ({ id: Math.random(), content, message_type: type, created_at: 1, private: false, status: 'sent' }) as ChatwootMessage

const ASK = '你好，老师这里已经检查了，老师想确定一下你是学生本人还是家长呢？'

describe('detectChatRole', () => {
  it('says student for a message that is only "我是学生"', () => {
    expect(detectChatRole([said('我是学生')])).toBe('student')
    expect(detectChatRole([said('我是学生本人哦！')])).toBe('student')
    expect(detectChatRole([said("I'm the student")])).toBe('student')
  })

  it('does not call a student\'s parent a student', () => {
    expect(detectChatRole([said('我是学生家长')])).toBe('parent')
    expect(detectChatRole([said('我是学生的妈妈，想了解课程')])).toBeNull()
  })

  it('takes a bare answer only after the team asked who it is', () => {
    expect(detectChatRole([said('学生')])).toBeNull()
    expect(detectChatRole([said(ASK, 1), said('学生')])).toBe('student')
    expect(detectChatRole([said(ASK, 1), said('家长')])).toBe('parent')
  })

  it('does not use a long message that merely contains the words', () => {
    expect(detectChatRole([said('我是学生，想问一下课程的价钱和上课时间是怎样的呢，谢谢老师。')])).toBeNull()
  })

  it('goes by the latest clear answer', () => {
    expect(detectChatRole([said('我是学生'), said(ASK, 1), said('家长')])).toBe('parent')
  })

  it('says nothing for ordinary messages and for the team\'s own words', () => {
    expect(detectChatRole([said('我要了解 HOA 课程'), said('我是学生', 1)])).toBeNull()
  })
})
