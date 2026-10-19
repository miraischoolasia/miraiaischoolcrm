import { useCallback, useEffect, useState } from 'react'
import { fetchTeamMembers, fetchTeams, isTeamsMissing, type Team, type TeamMembers } from '../lib/staffTeams'

// The school's teams and who is in them (My Team > Teams, the account list, the calendar filter).
export function useStaffTeams(enabled: boolean) {
  const [teams, setTeams] = useState<Team[]>([])
  const [members, setMembers] = useState<TeamMembers>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The database has no teams yet (before 20261026000000).
  const [missing, setMissing] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [nextTeams, nextMembers] = await Promise.all([fetchTeams(), fetchTeamMembers()])
      setTeams(nextTeams)
      setMembers(nextMembers)
      setError(null)
      setMissing(false)
    } catch (caught) {
      if (isTeamsMissing(caught)) {
        setMissing(true)
        setTeams([])
        setMembers(new Map())
        setError(null)
      } else {
        setError(caught instanceof Error ? caught.message : "Couldn't load the teams.")
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      void refresh()
    }
  }, [enabled, refresh])

  return { teams, members, loading, error, missing, refresh }
}
