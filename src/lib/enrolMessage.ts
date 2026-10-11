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
}

// The message to the parent for a Holiday Camp sign-up.
export function buildCampMessage({ childName, enrolled, zoom, formUrl, paid }: CampMessageInput) {
  const lines: string[] = []
  lines.push(paid ? '你好，已收到款项，谢谢您！' : '你好，谢谢您！')
  const child = childName.trim() || '孩子'
  if (enrolled) {
    lines.push(`${child} 已经报名 Mirai Online AI Holiday Camp（${enrolled.className}），${enrolled.startDate} 开始上课，共 ${enrolled.classes} 堂。`)
  }
  if (zoom) {
    lines.push('', `老师想先和您在 Zoom 上简单聊一下，时间：${formatZoomTime(zoom.startsAt)}`, `Zoom 链接：${zoom.link.trim()}`)
  }
  if (formUrl) {
    lines.push('', '麻烦您先填写这份报名表：', formUrl)
  }
  lines.push('', '期待见到你们！')
  return lines.join('\n')
}

export function buildEnrolMessage({ childName, classTime, zoom, formUrl, paid }: EnrolMessageInput) {
  const lines: string[] = []
  lines.push(paid ? '你好，已收到款项，谢谢您！' : '你好，谢谢您！')
  const child = childName.trim() || '孩子'
  if (classTime) {
    lines.push(`${child} 的 HOA 课程已经安排在 ${classTime}。`)
  }
  if (zoom) {
    lines.push('', `老师想先和您在 Zoom 上简单聊一下，时间：${formatZoomTime(zoom.startsAt)}`, `Zoom 链接：${zoom.link.trim()}`)
  }
  if (formUrl) {
    lines.push('', '麻烦您在上课前先填写这份报名表：', formUrl)
  }
  lines.push('', '期待见到你们！')
  return lines.join('\n')
}
