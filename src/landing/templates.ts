import type { LandingData } from './landingData'

// The ready-made pages a new landing page can start from. Each one is a saved page like any other, so a staff
// member only changes the words and pictures. (More, for books and events, come with the order form.)

export type LandingTemplate = {
  key: string
  label: string
  hint: string
  data: () => LandingData
}

let counter = 0
const id = (type: string) => `${type}-${Date.now().toString(36)}-${(counter += 1)}`

export const landingTemplates: LandingTemplate[] = [
  {
    key: 'blank',
    label: '空白页',
    hint: '从零开始，自己拖积木。',
    data: () => ({ root: { props: {} }, content: [] }),
  },
  {
    key: 'course',
    label: '课程招生',
    hint: '大图标题、介绍、两栏重点、常见问题、WhatsApp 报名。',
    data: () => ({
      root: { props: { background: 'white', floatingWhatsapp: 'on', floatingMessage: '你好，我想了解课程。' } },
      content: [
        {
          type: 'Hero',
          props: {
            id: id('Hero'),
            title: '让孩子爱上学习',
            subtitle: '小班线上课，老师一对一关心，每周都看得到进步。',
            image: '',
            background: 'brand',
            align: 'center',
            buttons: [
              { label: 'WhatsApp 报名', action: 'whatsapp', link: '', message: '你好，我想报名课程。' },
            ],
          },
        },
        {
          type: 'Text',
          props: {
            id: id('Text'),
            text: '<h2>为什么家长选择我们</h2><ul><li>小班上课，每个孩子都有机会发言</li><li>每堂课后都有老师的回馈</li><li>上课时间固定，方便安排</li></ul>',
            align: 'left',
            width: 'narrow',
          },
        },
        {
          type: 'Columns',
          props: {
            id: id('Columns'),
            layout: '1-1',
            gap: 'large',
            column1: [
              {
                type: 'Text',
                props: { id: id('Text'), text: '<h3>适合几岁</h3><p>在这里写适合的年龄和程度。</p>', align: 'left', width: 'wide' },
              },
            ],
            column2: [
              {
                type: 'Text',
                props: { id: id('Text'), text: '<h3>上课方式</h3><p>在这里写上课时间、地点或线上方式。</p>', align: 'left', width: 'wide' },
              },
            ],
            column3: [],
          },
        },
        {
          type: 'Faq',
          props: {
            id: id('Faq'),
            title: '常见问题',
            items: [
              { question: '可以先试上一堂吗？', answer: '可以，WhatsApp 我们约时间。' },
              { question: '学费怎么算？', answer: '在这里写学费，或请家长 WhatsApp 询问。' },
            ],
          },
        },
        {
          type: 'Cta',
          props: {
            id: id('Cta'),
            title: '名额有限，现在就报名',
            text: '有问题？直接 WhatsApp 我们。',
            tone: 'brand',
            button: { label: 'WhatsApp 报名', action: 'whatsapp', link: '', message: '你好，我想报名。' },
          },
        },
      ],
    }),
  },
]
