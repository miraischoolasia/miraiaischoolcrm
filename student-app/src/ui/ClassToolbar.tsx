import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'

// The class page's own toolbar over the Zoom video (a sample for now: only the
// development page shows it). The child drags it anywhere by its grip, or
// folds it to a small round button (also draggable) to give the video room.
// Its place and whether it is folded are remembered on this device.
export type ToolbarButton = {
  key: string
  icon: string
  label: string
  // On (true), off (false, shown crossed red) or a plain button (undefined).
  on?: boolean
  onPress: () => void
}

type Place = { x: number; y: number }
const storeKey = 'class-toolbar'
const barWidth = (count: number) => 44 + count * 76 + 44
const barHeight = 72
const knob = 56

function readStored(): { place: Place | null; folded: boolean } {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(storeKey) : null
    const value = raw ? (JSON.parse(raw) as { place?: Place; folded?: boolean }) : null
    return { place: value?.place ?? null, folded: Boolean(value?.folded) }
  } catch {
    return { place: null, folded: false }
  }
}

function writeStored(place: Place | null, folded: boolean) {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(storeKey, JSON.stringify({ place, folded }))
  } catch {
    // Not saved (private window): it starts at the bottom next time.
  }
}

export function ClassToolbar({ buttons, color, startFolded }: { buttons: ToolbarButton[]; color: string; startFolded?: boolean }) {
  const { width, height } = useWindowDimensions()
  const [stored] = useState(readStored)
  const [folded, setFolded] = useState(startFolded ?? stored.folded)
  const [place, setPlace] = useState<Place | null>(stored.place)
  const w = folded ? knob : barWidth(buttons.length)
  const h = folded ? knob : barHeight
  // Kept inside the window, whatever its size now.
  const clamp = (p: Place): Place => ({ x: Math.min(Math.max(8, p.x), width - w - 8), y: Math.min(Math.max(8, p.y), height - h - 8) })
  const shown = clamp(place ?? { x: (width - w) / 2, y: height - h - 20 })

  // Dragging (mouse, finger or pen): where the press started and the bar was then.
  const drag = useRef<{ id: number; fromX: number; fromY: number; from: Place; moved: boolean } | null>(null)
  type Pointer = { nativeEvent: PointerEvent }
  const down = (event: Pointer) => {
    const e = event.nativeEvent
    drag.current = { id: e.pointerId, fromX: e.clientX, fromY: e.clientY, from: shown, moved: false }
    ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
  }
  const move = (event: Pointer) => {
    const e = event.nativeEvent
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.fromX
    const dy = e.clientY - d.fromY
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (d.moved) setPlace(clamp({ x: d.from.x + dx, y: d.from.y + dy }))
  }
  const up = (event: Pointer) => {
    const e = event.nativeEvent
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId) return
    const next = clamp({ x: d.from.x + e.clientX - d.fromX, y: d.from.y + e.clientY - d.fromY })
    // A tap on the folded button (no drag) opens the bar again.
    if (folded && !d.moved) {
      setFolded(false)
      writeStored(place, false)
      return
    }
    if (!d.moved) return
    setPlace(next)
    writeStored(next, folded)
  }
  const handlers = { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up } as object

  function fold(value: boolean) {
    setFolded(value)
    writeStored(shown, value)
  }

  if (folded) {
    return (
      <View
        {...handlers}
        accessibilityRole="button"
        accessibilityLabel="Open the class buttons"
        style={[styles.knob, { left: shown.x, top: shown.y, borderColor: color }]}
      >
        <Text style={styles.knobText}>🎛️</Text>
      </View>
    )
  }
  return (
    <View style={[styles.bar, { left: shown.x, top: shown.y, width: w }]}>
      <View {...handlers} accessibilityLabel="Drag to move" style={styles.grip}>
        <Text style={styles.gripText}>⠿</Text>
      </View>
      {buttons.map((button) => (
        <Pressable
          key={button.key}
          accessibilityRole="button"
          accessibilityLabel={button.label}
          onPress={button.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed, button.on === false && styles.off]}
        >
          <Text style={styles.icon}>{button.icon}</Text>
          <Text style={[styles.label, button.on === false && styles.offLabel]} numberOfLines={1}>
            {button.label}
          </Text>
        </Pressable>
      ))}
      <Pressable accessibilityRole="button" accessibilityLabel="Fold the class buttons" onPress={() => fold(true)} style={styles.foldButton}>
        <Text style={styles.foldText}>▾</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    zIndex: 35,
    height: barHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderRadius: 22,
    backgroundColor: 'rgba(15,18,41,0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  grip: { width: 36, height: '100%', alignItems: 'center', justifyContent: 'center' },
  gripText: { color: 'rgba(255,255,255,0.7)', fontSize: 22 },
  button: { width: 72, height: 60, marginHorizontal: 2, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.14)' },
  off: { backgroundColor: 'rgba(185,28,28,0.28)' },
  icon: { fontSize: 22 },
  label: { color: '#fff', fontSize: 12, fontWeight: '700' },
  offLabel: { color: '#fecaca' },
  foldButton: { width: 36, height: '100%', alignItems: 'center', justifyContent: 'center' },
  foldText: { color: 'rgba(255,255,255,0.8)', fontSize: 18, fontWeight: '800' },
  knob: {
    position: 'absolute',
    zIndex: 35,
    width: knob,
    height: knob,
    borderRadius: knob / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,18,41,0.86)',
  },
  knobText: { fontSize: 24 },
})
