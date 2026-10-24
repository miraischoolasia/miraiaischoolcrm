import { useEffect, useState } from 'react'

// Loads one Today figure for a person (null = the signed-in one) and again when the person changes. `null` data means
// "not there" (an older database, no access, a failed call): the card is not drawn.
export function useTodayData<T>(fetcher: (personId: number | null) => Promise<T | null>, personId: number | null) {
  const [state, setState] = useState<{ key: number | null; data: T | null; done: boolean }>({
    key: personId,
    data: null,
    done: false,
  })

  useEffect(() => {
    let cancelled = false
    setState({ key: personId, data: null, done: false })
    fetcher(personId)
      .then((data) => {
        if (!cancelled) setState({ key: personId, data, done: true })
      })
      .catch(() => {
        if (!cancelled) setState({ key: personId, data: null, done: true })
      })
    return () => {
      cancelled = true
    }
    // The fetchers are module functions: only the person decides a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId])

  return { data: state.key === personId ? state.data : null, loading: state.key !== personId || !state.done }
}
