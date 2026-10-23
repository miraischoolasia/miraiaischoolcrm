import type { Config, Fields, Slot } from '@puckeditor/core'
import type { ReactNode } from 'react'
import {
  ColumnsBlock,
  CtaBlock,
  DividerBlock,
  FaqBlock,
  HeroBlock,
  hostBrandStyle,
  ImageBlock,
  LandingShell,
  SpacerBlock,
  TextBlock,
  WhatsappBlock,
  type ColumnsLayout,
  type CtaProps,
  type FaqProps,
  type HeroProps,
  type ImageProps,
  type PageButton,
  type WhatsappProps,
} from './blocks'
import { ImageField } from './ImageField'

// The blocks staff can use on a landing page, with the fields they fill in (labels in Chinese for the editor).
// Only types come from the editor package, so the public page can use this without loading the editor.

export type LandingRootProps = {
  title?: string
  shareTitle: string
  shareDescription: string
  shareImage: string
  background: 'white' | 'soft'
  floatingWhatsapp: 'on' | 'off'
  floatingMessage: string
}

type ColumnsProps = {
  layout: ColumnsLayout
  gap: 'small' | 'large'
  column1: Slot
  column2: Slot
  column3: Slot
}

type LandingComponents = {
  Hero: HeroProps
  Text: { text: string; align: 'left' | 'center'; width: 'narrow' | 'wide' }
  Image: ImageProps
  Columns: ColumnsProps
  Faq: FaqProps
  Cta: CtaProps
  Whatsapp: WhatsappProps
  Spacer: { size: 'small' | 'medium' | 'large' }
  Divider: Record<string, never>
}

const imageField = (label: string) =>
  ({
    type: 'custom',
    label,
    render: ({ value, onChange, readOnly }: { value: string; onChange: (value: string) => void; readOnly?: boolean }) => (
      <ImageField label={label} value={value ?? ''} onChange={onChange} readOnly={readOnly} />
    ),
  }) as const

const alignField = {
  type: 'radio',
  label: '对齐',
  options: [
    { label: '靠左', value: 'left' },
    { label: '置中', value: 'center' },
  ],
} as const

const buttonFields: Fields<PageButton> = {
  label: { type: 'text', label: '按钮文字' },
  action: {
    type: 'radio',
    label: '按了去哪里',
    options: [
      { label: 'WhatsApp', value: 'whatsapp' },
      { label: '连结', value: 'link' },
    ],
  },
  link: { type: 'text', label: '连结（https://… ，选「连结」时用）' },
  message: { type: 'textarea', label: 'WhatsApp 预设讯息（选 WhatsApp 时用）' },
}

const whatsappButton = (label: string, message = ''): PageButton => ({ label, action: 'whatsapp', link: '', message })

export const landingConfig: Config<LandingComponents, LandingRootProps> = {
  categories: {
    layout: { title: '版面', components: ['Hero', 'Columns', 'Spacer', 'Divider'] },
    content: { title: '内容', components: ['Text', 'Image', 'Faq'] },
    action: { title: '行动', components: ['Cta', 'Whatsapp'] },
  },
  root: {
    fields: {
      shareTitle: { type: 'text', label: '分享标题（WhatsApp / Facebook 预览）' },
      shareDescription: { type: 'textarea', label: '分享说明（一两句）' },
      shareImage: imageField('分享图片（建议 1200 × 630）'),
      background: {
        type: 'radio',
        label: '页面底色',
        options: [
          { label: '白色', value: 'white' },
          { label: '浅灰', value: 'soft' },
        ],
      },
      floatingWhatsapp: {
        type: 'radio',
        label: '右下角浮动 WhatsApp 按钮',
        options: [
          { label: '显示', value: 'on' },
          { label: '不显示', value: 'off' },
        ],
      },
      floatingMessage: { type: 'textarea', label: '浮动按钮的预设讯息' },
    },
    defaultProps: {
      shareTitle: '',
      shareDescription: '',
      shareImage: '',
      background: 'white',
      floatingWhatsapp: 'off',
      floatingMessage: '你好，我想了解更多。',
    },
    render: ({ children, background, floatingWhatsapp, floatingMessage, puck }) => (
      <LandingShell
        background={background ?? 'white'}
        floatingWhatsapp={floatingWhatsapp ?? 'off'}
        floatingMessage={floatingMessage ?? ''}
        editing={Boolean(puck?.isEditing)}
        brandStyle={hostBrandStyle()}
      >
        {children}
      </LandingShell>
    ),
  },
  components: {
    Hero: {
      label: '大图标题',
      fields: {
        title: { type: 'textarea', label: '标题' },
        subtitle: { type: 'textarea', label: '副标题' },
        image: imageField('图片'),
        background: {
          type: 'radio',
          label: '背景',
          options: [
            { label: '品牌色', value: 'brand' },
            { label: '浅色', value: 'light' },
            { label: '图片当背景', value: 'image' },
          ],
        },
        align: alignField,
        buttons: {
          type: 'array',
          label: '按钮（最多 2 个）',
          max: 2,
          arrayFields: buttonFields,
          defaultItemProps: whatsappButton('WhatsApp 问我们'),
          getItemSummary: (item) => item.label || '按钮',
        },
      },
      defaultProps: {
        title: '让孩子爱上学习',
        subtitle: '小班线上课，每周都看得到进步。',
        image: '',
        background: 'brand',
        align: 'center',
        buttons: [whatsappButton('WhatsApp 问我们', '你好，我想了解课程。')],
      },
      render: ({ puck, ...props }) => <HeroBlock {...props} editing={puck.isEditing} />,
    },
    Text: {
      label: '文字',
      fields: {
        text: { type: 'richtext', label: '文字' },
        align: alignField,
        width: {
          type: 'radio',
          label: '宽度',
          options: [
            { label: '窄（好读）', value: 'narrow' },
            { label: '宽', value: 'wide' },
          ],
        },
      },
      defaultProps: {
        text: '<p>在这里写介绍。可以用<strong>粗体</strong>、清单和连结。</p>',
        align: 'left',
        width: 'narrow',
      },
      render: ({ text, align, width }) => <TextBlock text={text as ReactNode} align={align} width={width} />,
    },
    Image: {
      label: '图片',
      fields: {
        src: imageField('图片'),
        alt: { type: 'text', label: '图片说明（给看不到图片的人，必填）' },
        caption: { type: 'text', label: '图片下面的小字' },
        width: {
          type: 'radio',
          label: '大小',
          options: [
            { label: '小', value: 'small' },
            { label: '中', value: 'medium' },
            { label: '满版', value: 'full' },
          ],
        },
        rounded: {
          type: 'radio',
          label: '圆角',
          options: [
            { label: '要', value: 'yes' },
            { label: '不要', value: 'no' },
          ],
        },
      },
      defaultProps: { src: '', alt: '', caption: '', width: 'medium', rounded: 'yes' },
      render: ({ puck, ...props }) => <ImageBlock {...props} editing={puck.isEditing} />,
    },
    Columns: {
      label: '多栏',
      fields: {
        layout: {
          type: 'select',
          label: '栏位',
          options: [
            { label: '两栏一样宽', value: '1-1' },
            { label: '两栏，左边宽', value: '2-1' },
            { label: '两栏，右边宽', value: '1-2' },
            { label: '三栏', value: '1-1-1' },
          ],
        },
        gap: {
          type: 'radio',
          label: '间距',
          options: [
            { label: '小', value: 'small' },
            { label: '大', value: 'large' },
          ],
        },
        column1: { type: 'slot', label: '第 1 栏' },
        column2: { type: 'slot', label: '第 2 栏' },
        column3: { type: 'slot', label: '第 3 栏' },
      },
      defaultProps: { layout: '1-1', gap: 'large', column1: [], column2: [], column3: [] },
      render: ({ layout, gap, column1: Column1, column2: Column2, column3: Column3 }) => (
        <ColumnsBlock
          layout={layout}
          gap={gap}
          columns={[
            <Column1 key="1" className="flex min-h-16 flex-col" />,
            <Column2 key="2" className="flex min-h-16 flex-col" />,
            ...(layout === '1-1-1' ? [<Column3 key="3" className="flex min-h-16 flex-col" />] : []),
          ]}
        />
      ),
    },
    Faq: {
      label: '常见问题',
      fields: {
        title: { type: 'text', label: '标题' },
        items: {
          type: 'array',
          label: '问题',
          arrayFields: {
            question: { type: 'text', label: '问题' },
            answer: { type: 'textarea', label: '答案' },
          },
          defaultItemProps: { question: '新的问题', answer: '' },
          getItemSummary: (item) => item.question || '问题',
        },
      },
      defaultProps: {
        title: '常见问题',
        items: [
          { question: '上课时间是什么时候？', answer: '每周固定时间上课，报名后老师会跟你确认。' },
          { question: '可以先试上一堂吗？', answer: '可以，按下面的按钮跟我们约时间。' },
        ],
      },
      render: ({ puck, ...props }) => <FaqBlock {...props} editing={puck.isEditing} />,
    },
    Cta: {
      label: '行动区',
      fields: {
        title: { type: 'textarea', label: '标题' },
        text: { type: 'textarea', label: '一句话' },
        tone: {
          type: 'radio',
          label: '颜色',
          options: [
            { label: '品牌色', value: 'brand' },
            { label: '浅色', value: 'light' },
          ],
        },
        button: { type: 'object', label: '按钮', objectFields: buttonFields },
      },
      defaultProps: {
        title: '名额有限，现在就报名',
        text: '有问题？直接 WhatsApp 我们。',
        tone: 'brand',
        button: whatsappButton('WhatsApp 报名', '你好，我想报名。'),
      },
      render: ({ puck, ...props }) => <CtaBlock {...props} editing={puck.isEditing} />,
    },
    Whatsapp: {
      label: 'WhatsApp 按钮',
      fields: {
        label: { type: 'text', label: '按钮文字' },
        number: { type: 'text', label: '号码（空白 = 用学校的号码）' },
        message: { type: 'textarea', label: '预设讯息' },
        align: alignField,
      },
      defaultProps: { label: 'WhatsApp 问我们', number: '', message: '你好，我想了解更多。', align: 'center' },
      render: ({ puck, ...props }) => <WhatsappBlock {...props} editing={puck.isEditing} />,
    },
    Spacer: {
      label: '间隔',
      fields: {
        size: {
          type: 'radio',
          label: '高度',
          options: [
            { label: '小', value: 'small' },
            { label: '中', value: 'medium' },
            { label: '大', value: 'large' },
          ],
        },
      },
      defaultProps: { size: 'medium' },
      render: ({ size }) => <SpacerBlock size={size} />,
    },
    Divider: {
      label: '分隔线',
      fields: {},
      render: () => <DividerBlock />,
    },
  },
}
