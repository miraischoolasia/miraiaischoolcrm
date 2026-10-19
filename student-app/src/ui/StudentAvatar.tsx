import { Text, View } from 'react-native'

import { avatarLook, initials } from '@/lib/avatarLook'

// On phones (no SVG library in the app): the child's colour and initials.
// The web build uses StudentAvatar.web.tsx, the cartoon face.
export function StudentAvatar({ id, name, size = 40, dim = false }: { id: number; name: string; size?: number; dim?: boolean }) {
  const look = avatarLook(id)
  return (
    <View
      accessibilityLabel={name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: look.background,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.5 : 1,
      }}
    >
      <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: '#1f2937' }}>{initials(name)}</Text>
    </View>
  )
}
