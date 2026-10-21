import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { wantsChannelAccess } from '../../lib/channelAlerts'

type Tab = 'accounts' | 'teams' | 'hours'

type MyTeamTabsProps = {
  // Admin only: the account list and the teams.
  accounts: ReactNode | null
  teams: ReactNode | null
  hours: ReactNode
}

// My Team, in three parts: the accounts (as before), the teams, and the working hours.
export function MyTeamTabs({ accounts, teams, hours }: MyTeamTabsProps) {
  const tabs = [
    accounts ? { key: 'accounts' as const, label: 'Accounts' } : null,
    teams ? { key: 'teams' as const, label: 'Teams' } : null,
    { key: 'hours' as const, label: 'Working hours' },
  ].filter((tab): tab is { key: Tab; label: string } => tab !== null)
  // Opened from the "Open Inbox channels" button of the alert bar: start on Teams.
  const [active, setActive] = useState<Tab>(() => (teams && wantsChannelAccess() ? 'teams' : tabs[0].key))
  useEffect(() => {
    const onHash = () => {
      if (wantsChannelAccess()) {
        setActive('teams')
      }
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const shown = tabs.some((tab) => tab.key === active) ? active : tabs[0].key

  return (
    <div className="space-y-4">
      {tabs.length > 1 && (
        <div role="tablist" aria-label="My Team" className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={shown === tab.key}
              onClick={() => setActive(tab.key)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition',
                shown === tab.key ? 'bg-white text-[#be185d] shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel">{shown === 'accounts' ? accounts : shown === 'teams' ? teams : hours}</div>
    </div>
  )
}
