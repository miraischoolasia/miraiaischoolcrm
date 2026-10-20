import { useRouter } from 'expo-router'

import { useSession } from '@/lib/session'
import { PracticeView } from '@/ui/PracticeView'

// /practice: daily practice for the picked child (ui/PracticeView.tsx).
export default function Practice() {
  const { child, branding, refresh } = useSession()
  const router = useRouter()
  return (
    <PracticeView
      studentId={child?.studentId ?? null}
      color={branding.accentColor}
      onCoins={() => void refresh()}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
    />
  )
}
