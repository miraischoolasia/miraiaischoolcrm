import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

// The class page's menu at the right edge (a sample for now: only the
// development page shows it). One press folds it to a small tab, like the
// CRM's « button; another opens it again. Items without an action now are
// shown greyed ("Soon", or their own word such as "None").
export type SideMenuItem = {
  key: string
  icon: string
  label: string
  // A small count or dot beside the label (for example notes, or a new question).
  badge?: string | null
  onPress?: () => void
  // Shown greyed when there is nothing to press (default "Soon").
  idle?: string
}

export function ClassSideMenu({ items, color, top = 64, startOpen = true }: { items: SideMenuItem[]; color: string; top?: number; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen)
  if (!open) {
    return (
      <View style={[styles.wrap, { top }]} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel="Open the menu" onPress={() => setOpen(true)} style={styles.tab}>
          <Text style={styles.tabText}>«</Text>
          {items.some((item) => item.badge) && <View style={[styles.dot, { backgroundColor: color }]} />}
        </Pressable>
      </View>
    )
  }
  return (
    <View style={[styles.wrap, { top }]} pointerEvents="box-none">
      <View style={styles.panel}>
        <Pressable accessibilityRole="button" accessibilityLabel="Fold the menu" onPress={() => setOpen(false)} style={styles.fold}>
          <Text style={styles.foldText}>»</Text>
        </Pressable>
        {items.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            disabled={!item.onPress}
            onPress={item.onPress}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed, !item.onPress && styles.itemOff]}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
            {item.onPress ? (
              item.badge ? (
                <View style={[styles.badge, { backgroundColor: color }]}>
                  <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
              ) : null
            ) : (
              <Text style={styles.soon}>{item.idle ?? 'Soon'}</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 0, zIndex: 30, alignItems: 'flex-end' },
  panel: {
    marginRight: 12,
    width: 176,
    padding: 6,
    gap: 4,
    borderRadius: 18,
    backgroundColor: 'rgba(15,18,41,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  fold: { alignSelf: 'flex-end', width: 32, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  foldText: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: '800' },
  item: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 12 },
  itemPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  itemOff: { opacity: 0.5 },
  icon: { fontSize: 18 },
  label: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  soon: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700' },
  tab: {
    width: 34,
    height: 56,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,18,41,0.82)',
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  tabText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  dot: { position: 'absolute', top: 8, left: 7, width: 8, height: 8, borderRadius: 4 },
})
