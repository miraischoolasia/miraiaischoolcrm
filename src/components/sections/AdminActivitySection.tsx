import type { AdminActivity, Teacher } from '../../types/domain'

type AdminActivitySectionProps = {
  activities: AdminActivity[]
  teacherMap: Map<number, Teacher>
  onLoadMore?: () => void
  isLoadingMore?: boolean
  hasMore?: boolean
}

export function AdminActivitySection({
  activities,
  teacherMap,
  onLoadMore,
  isLoadingMore,
  hasMore,
}: AdminActivitySectionProps) {
  const formatAction = (action: string) =>
    action
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-900">Admin Activity Log</h2>
        <p className="mt-1 text-sm text-slate-500">
          Immutable history of Admin changes. Entries cannot be edited or deleted.
        </p>
      </div>

      {activities.length === 0 ? (
        <div className="px-6 py-16 text-center text-sm text-slate-500">
          No Admin activity has been recorded yet.
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {activities.map((activity) => {
            const details = Object.entries(activity.details).filter(
              ([, value]) => value !== null && value !== '',
            )
            return (
              <div
                key={activity.id}
                className="grid gap-2 px-4 py-3 lg:grid-cols-[170px_160px_minmax(0,1fr)]"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-700">
                    {new Date(activity.createdAt).toLocaleString('en-MY')}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Log #{activity.id}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#be185d]">
                    {formatAction(activity.actionType)}
                  </div>
                  <div className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                    {activity.entityType}
                  </div>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    {activity.entityLabel}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    By {teacherMap.get(activity.actorTeacherId ?? -1)?.fullName ?? 'System Admin'}
                  </div>
                  {details.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                      {details.map(([key, value]) => (
                        <span key={key}>
                          {key.replaceAll('_', ' ')}: {String(value)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {onLoadMore && hasMore && (
        <div className="border-t border-slate-200 px-4 py-4 text-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingMore ? 'Loading...' : 'Load older activity'}
          </button>
        </div>
      )}
    </section>
  )
}
