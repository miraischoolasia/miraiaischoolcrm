import { useEffect, useState } from 'react'
import { fetchLeadFormSubmissions, fetchLeadIdsWithFormSubmissions } from '../lib/api'
import type { Lead, LeadFormSubmission } from '../types/domain'

// Which leads came with form answers (for the "Form" tag), and the answers of
// the lead being edited. A failure just means no tag / no answers: the lead
// itself is not affected.
export function useLeadFormAnswers(
  enabled: boolean,
  leads: Lead[],
  editingLeadId: number | null,
) {
  const [leadIds, setLeadIds] = useState<Set<number>>(new Set())
  const [loaded, setLoaded] = useState<{ leadId: number; submissions: LeadFormSubmission[] } | null>(
    null,
  )

  // Looked up again whenever the leads are reloaded, so a lead that has just
  // arrived from a form is tagged.
  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    fetchLeadIdsWithFormSubmissions()
      .then((ids) => {
        if (!cancelled) {
          setLeadIds(new Set(ids))
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled, leads])

  useEffect(() => {
    if (!enabled || editingLeadId === null) {
      return
    }
    let cancelled = false
    fetchLeadFormSubmissions(editingLeadId)
      .then((submissions) => {
        if (!cancelled) {
          setLoaded({ leadId: editingLeadId, submissions })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({ leadId: editingLeadId, submissions: [] })
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, editingLeadId])

  const isCurrent = loaded !== null && loaded.leadId === editingLeadId
  return {
    leadIdsWithForms: leadIds,
    submissions: isCurrent ? loaded.submissions : [],
    isLoading: enabled && editingLeadId !== null && !isCurrent,
  }
}
