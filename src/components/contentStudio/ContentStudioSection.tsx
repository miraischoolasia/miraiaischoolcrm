import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  contentErrorMessage,
  fetchAngles,
  fetchStudioSettings,
  fetchStyles,
  type StudioAngle,
  type StudioSettings,
  type StudioStyle,
} from '../../lib/contentStudio'
import { BriefsPanel } from './BriefsPanel'
import { ReviewPanel } from './ReviewPanel'
import { SettingsPanel } from './SettingsPanel'
import { StylesAnglesPanel } from './StylesAnglesPanel'
import { Notice, Tabs } from './ui'

type ContentStudioSectionProps = {
  // Content Studio's edit tick: write briefs, ask the AI, review, change styles, angles and the voice.
  canEdit: boolean
  // Limits and the AI provider.
  isAdmin: boolean
  teacherNames: Map<number, string>
}

type Tab = 'briefs' | 'review' | 'library' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'briefs', label: 'Campaigns' },
  { key: 'review', label: 'Review' },
  { key: 'library', label: 'Styles & angles' },
  { key: 'settings', label: 'Settings' },
]

// Marketing > Content Studio: briefs → AI plan → review. Approved posts go to the Content Library.
export function ContentStudioSection({ canEdit, isAdmin, teacherNames }: ContentStudioSectionProps) {
  const [tab, setTab] = useState<Tab>('briefs')
  const [settings, setSettings] = useState<StudioSettings | null>(null)
  const [styles, setStyles] = useState<StudioStyle[]>([])
  const [angles, setAngles] = useState<StudioAngle[]>([])
  const [problem, setProblem] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [nextSettings, nextStyles, nextAngles] = await Promise.all([fetchStudioSettings(), fetchStyles(), fetchAngles()])
      setSettings(nextSettings)
      setStyles(nextStyles)
      setAngles(nextAngles)
      setProblem(null)
    } catch (failure) {
      setSettings(DEFAULT_SETTINGS)
      setProblem(contentErrorMessage(failure, 'Content Studio could not be loaded.'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="space-y-4">
      <Tabs label="Content Studio" tabs={TABS} value={tab} onChange={setTab} />
      {problem && <Notice notice={{ text: problem, isError: true }} />}
      {settings === null ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
      ) : tab === 'briefs' ? (
        <BriefsPanel canEdit={canEdit} settings={settings} styles={styles} angles={angles} />
      ) : tab === 'review' ? (
        <ReviewPanel canEdit={canEdit} settings={settings} styles={styles} angles={angles} />
      ) : tab === 'library' ? (
        <StylesAnglesPanel canEdit={canEdit} styles={styles} angles={angles} onChanged={load} />
      ) : (
        <SettingsPanel canEdit={canEdit} isAdmin={isAdmin} settings={settings} teacherNames={teacherNames} onSaved={load} />
      )}
    </section>
  )
}
