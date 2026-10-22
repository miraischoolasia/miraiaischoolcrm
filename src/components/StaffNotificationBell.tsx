import { useEffect, useRef, useState } from 'react'
import { Bell } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { NOTIFICATION_LIMIT, noteBody, panelPlace, timeAgo, type StaffNotification } from '../lib/staffNotifications'

type StaffNotificationBellProps = {
  items: StaffNotification[]
  unread: number
  onMarkRead: (ids: number[] | null) => void
  // Null when this person cannot open that page; the link is then not shown.
  onOpenChat: ((leadId: number) => void) | null
  onOpenLead: ((leadId: number) => void) | null
  onOpenStudent: ((studentId: number) => void) | null
}

const linkClass = 'rounded-md px-2 py-0.5 text-xs font-semibold text-[#be185d] hover:bg-pink-50'

// The bell at the top of the CRM: notes a flow left for the signed-in person, newest first.
export function StaffNotificationBell({ items, unread, onMarkRead, onOpenChat, onOpenLead, onOpenStudent }: StaffNotificationBellProps) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    const measure = () => {
      if (button.current) {
        setPlace(panelPlace(button.current.getBoundingClientRect(), window.innerWidth))
      }
    }
    measure()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open])

  // Opening a link marks that note read and closes the list.
  function go(item: StaffNotification, action: () => void) {
    if (item.readAt === null) {
      onMarkRead([item.id])
    }
    setOpen(false)
    action()
  }

  const badge = unread >= NOTIFICATION_LIMIT ? `${NOTIFICATION_LIMIT}+` : String(unread)

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
      >
        <Bell size={16} weight={unread > 0 ? 'fill' : 'regular'} aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-[#fc0c97] px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {badge}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          style={place ?? undefined}
          className="fixed z-50 rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unread > 0 && (
              <button type="button" onClick={() => onMarkRead(null)} className="text-xs font-semibold text-slate-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-slate-500">
              Nothing yet. Notes from your automations show up here.
            </p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {items.map((item) => {
                const isUnread = item.readAt === null
                return (
                  <li key={item.id} className={cn('px-3 py-2.5', isUnread && 'bg-pink-50/60')}>
                    <div className="flex items-start gap-2">
                      {isUnread && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#fc0c97]" />}
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm text-slate-900', isUnread && 'font-semibold')}>{item.title}</p>
                        {noteBody(item) !== '' && (
                          <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-xs text-slate-600">{noteBody(item)}</p>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="mr-1 text-[11px] text-slate-400">{timeAgo(item.createdAt)}</span>
                          {item.leadId !== null && onOpenChat && (
                            <button type="button" className={linkClass} onClick={() => go(item, () => onOpenChat(item.leadId!))}>
                              Open chat
                            </button>
                          )}
                          {item.leadId !== null && onOpenLead && (
                            <button type="button" className={linkClass} onClick={() => go(item, () => onOpenLead(item.leadId!))}>
                              Lead
                            </button>
                          )}
                          {item.studentId !== null && onOpenStudent && (
                            <button
                              type="button"
                              className={linkClass}
                              onClick={() => go(item, () => onOpenStudent(item.studentId!))}
                            >
                              Student
                            </button>
                          )}
                          {isUnread && (
                            <button
                              type="button"
                              onClick={() => onMarkRead([item.id])}
                              className="ml-auto text-[11px] font-semibold text-slate-500 hover:underline"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
