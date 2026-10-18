// Where the buttons of the one-tap ring sit around a child's face: evenly
// round a circle, the first at the top, going clockwise.

export function radialPositions(count: number, radius: number, startDegrees = -90) {
  if (count <= 0) return []
  const step = 360 / count
  return Array.from({ length: count }, (_, index) => {
    const angle = ((startDegrees + index * step) * Math.PI) / 180
    return { x: Math.round(Math.cos(angle) * radius), y: Math.round(Math.sin(angle) * radius) }
  })
}
