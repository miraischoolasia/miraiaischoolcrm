import { useLocalSearchParams } from 'expo-router'

import { useSession } from '@/lib/session'
import { ClassRoomView } from '@/ui/ClassRoomView'

// /class/<session id>: the lesson inside the app (ui/ClassRoomView.tsx), for
// a lesson the teacher has opened. Its Zoom link is the small fallback.
export default function ClassPage() {
  const params = useLocalSearchParams<{ sessionId: string }>()
  const sessionId = Number(params.sessionId)
  const { home } = useSession()
  const link = home?.schedule?.find((item) => item.session_id === sessionId)?.zoom_link ?? null
  return <ClassRoomView sessionId={sessionId} fallbackLink={link} />
}
