// The message to the parent once an HOA class is booked, written from what the team saved.
// It lands in the message box for the team to read and change before pressing Send.

export type EnrolMessageInput = {
  childName: string
  // How the class time reads, such as "Sat 18 Oct, 10:00 to 12:00"; null before a class is booked.
  classTime: string | null
  // The next Zoom meeting arranged with the parent, if any.
  zoom: { startsAt: Date; link: string } | null
  // The registration form link, if the form should be asked for in this message.
  formUrl: string | null
  // True when the payment receipt is saved, so the message can thank them.
  paid: boolean
  // The student is the one writing: the message speaks to them (你), not to a parent (您).
  toStudent?: boolean
}

export function formatZoomTime(date: Date) {
  const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
  return `${day}, ${time}`
}

export type CampMessageInput = {
  childName: string
  // The camp class and when it starts, such as "Mon 20 Oct"; null before the child is enrolled.
  enrolled: { className: string; startDate: string; classes: number } | null
  zoom: { startsAt: Date; link: string } | null
  formUrl: string | null
  paid: boolean
  toStudent?: boolean
}

// How the same message reads to a parent and to a student who writes themself.
function voice(toStudent: boolean | undefined) {
  return toStudent
    ? {
        thanks: '谢谢你！',
        zoom: '老师想先在 Zoom 上和你简单聊一下',
        form: '麻烦你先填写这份报名表（需要的话请家长一起填）：',
        formBeforeClass: '麻烦你在上课前先填写这份报名表（需要的话请家长一起填）：',
        bye: '期待见到你！',
      }
    : {
        thanks: '谢谢您！',
        zoom: '老师想先和您在 Zoom 上简单聊一下',
        form: '麻烦您先填写这份报名表：',
        formBeforeClass: '麻烦您在上课前先填写这份报名表：',
        bye: '期待见到你们！',
      }
}

// The message to the parent (or to the student) for a Holiday Camp sign-up.
export function buildCampMessage({ childName, enrolled, zoom, formUrl, paid, toStudent }: CampMessageInput) {
  const say = voice(toStudent)
  const lines: string[] = []
  lines.push(paid ? `你好，已收到款项，${say.thanks}` : `你好，${say.thanks}`)
  const child = toStudent ? '你' : childName.trim() || '孩子'
  if (enrolled) {
    lines.push(`${child} 已经报名 Mirai Online AI Holiday Camp（${enrolled.className}），${enrolled.startDate} 开始上课，共 ${enrolled.classes} 堂。`)
  }
  if (zoom) {
    lines.push('', `${say.zoom}，时间：${formatZoomTime(zoom.startsAt)}`)
    if (zoom.link.trim()) {
      lines.push(`Zoom 链接：${zoom.link.trim()}`)
    }
  }
  if (formUrl) {
    lines.push('', say.form, formUrl)
  }
  lines.push('', say.bye)
  return lines.join('\n')
}

export function buildEnrolMessage({ childName, classTime, zoom, formUrl, paid, toStudent }: EnrolMessageInput) {
  const say = voice(toStudent)
  const lines: string[] = []
  lines.push(paid ? `你好，已收到款项，${say.thanks}` : `你好，${say.thanks}`)
  if (classTime) {
    lines.push(toStudent ? `你的 HOA 课程已经安排在 ${classTime}。` : `${childName.trim() || '孩子'} 的 HOA 课程已经安排在 ${classTime}。`)
  }
  if (zoom) {
    lines.push('', `${say.zoom}，时间：${formatZoomTime(zoom.startsAt)}`)
    if (zoom.link.trim()) {
      lines.push(`Zoom 链接：${zoom.link.trim()}`)
    }
  }
  if (formUrl) {
    lines.push('', say.formBeforeClass, formUrl)
  }
  lines.push('', say.bye)
  return lines.join('\n')
}
