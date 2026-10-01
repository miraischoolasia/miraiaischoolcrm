import { describe, expect, it } from 'vitest'
import { parseHeadingInlines, parseRichInline, parseRichText } from './richText'

describe('parseRichInline', () => {
  it('finds bold words and links among plain text', () => {
    expect(parseRichInline('Join **free trial** now, see [our site](https://mirai.my) today')).toEqual([
      { kind: 'text', text: 'Join ' },
      { kind: 'bold', text: 'free trial' },
      { kind: 'text', text: ' now, see ' },
      { kind: 'link', text: 'our site', href: 'https://mirai.my' },
      { kind: 'text', text: ' today' },
    ])
  })

  it('keeps a link that is not a web address as plain words', () => {
    expect(parseRichInline('[click](javascript:alert(1))')).toEqual([
      { kind: 'text', text: '[click](javascript:alert(1))' },
    ])
    expect(parseRichInline('[x](data:text/html,hi)')).toEqual([
      { kind: 'text', text: '[x](data:text/html,hi)' },
    ])
  })

  it('leaves unfinished formatting alone', () => {
    expect(parseRichInline('a **open and [half](')).toEqual([
      { kind: 'text', text: 'a **open and [half](' },
    ])
  })

  it('never treats angle brackets as markup', () => {
    expect(parseRichInline('<b>hi</b> <script>x</script>')).toEqual([
      { kind: 'text', text: '<b>hi</b> <script>x</script>' },
    ])
  })
})

describe('parseRichText', () => {
  it('splits paragraphs on blank lines and keeps line breaks inside one', () => {
    expect(parseRichText('Line one\nLine two\n\nNext paragraph')).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'Line one' },
          { kind: 'break' },
          { kind: 'text', text: 'Line two' },
        ],
      },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'Next paragraph' }] },
    ])
  })

  it('turns lines starting with a dash or star into one list', () => {
    expect(parseRichText('What to bring:\n- laptop\n* **water** bottle\nDone')).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'What to bring:' }] },
      {
        kind: 'list',
        items: [
          [{ kind: 'text', text: 'laptop' }],
          [{ kind: 'bold', text: 'water' }, { kind: 'text', text: ' bottle' }],
        ],
      },
      { kind: 'paragraph', inlines: [{ kind: 'text', text: 'Done' }] },
    ])
  })

  it('handles Windows line endings and empty text', () => {
    expect(parseRichText('a\r\n\r\nb')).toHaveLength(2)
    expect(parseRichText('')).toEqual([])
    expect(parseRichText('  \n \n')).toEqual([])
  })

  it('does not make a list out of a dash without a space', () => {
    expect(parseRichText('-5 degrees')).toEqual([
      { kind: 'paragraph', inlines: [{ kind: 'text', text: '-5 degrees' }] },
    ])
  })
})

describe('parseHeadingInlines', () => {
  it('keeps each line on its own row and ignores blank lines and list dashes', () => {
    expect(parseHeadingInlines('Free Trial\n\n- Ages 6-17')).toEqual([
      { kind: 'text', text: 'Free Trial' },
      { kind: 'break' },
      { kind: 'text', text: '- Ages 6-17' },
    ])
  })
})
