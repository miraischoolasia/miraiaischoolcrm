import { performanceMetricDefinitions } from '../lib/constants'
import type { ReviewScoreField } from '../types/domain'

export function PerformanceRadarChart({
  averages,
}: {
  averages: Record<ReviewScoreField, number>
}) {
  const size = 240
  const center = size / 2
  const radius = 74

  function getPoint(index: number, value: number) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / performanceMetricDefinitions.length
    const scaledRadius = (Math.max(0, Math.min(5, value)) / 5) * radius
    return {
      x: center + Math.cos(angle) * scaledRadius,
      y: center + Math.sin(angle) * scaledRadius,
    }
  }

  const polygonPoints = performanceMetricDefinitions
    .map((metric, index) => {
      const point = getPoint(index, averages[metric.scoreField] ?? 0)
      return `${point.x},${point.y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[230px] w-[230px]">
      {[1, 2, 3, 4, 5].map((level) => {
        const levelPoints = performanceMetricDefinitions
          .map((_, index) => {
            const point = getPoint(index, level)
            return `${point.x},${point.y}`
          })
          .join(' ')

        return (
          <polygon
            key={level}
            points={levelPoints}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        )
      })}

      {performanceMetricDefinitions.map((metric, index) => {
        const edgePoint = getPoint(index, 5)
        const labelPoint = getPoint(index, 5.8)
        return (
          <g key={metric.key}>
            <line
              x1={center}
              y1={center}
              x2={edgePoint.x}
              y2={edgePoint.y}
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500 text-[11px] font-semibold"
            >
              {metric.shortLabel}
            </text>
          </g>
        )
      })}

      <polygon
        points={polygonPoints}
        fill="#fc0c9726"
        stroke="#fc0c97"
        strokeWidth="2"
      />

      {performanceMetricDefinitions.map((metric, index) => {
        const point = getPoint(index, averages[metric.scoreField] ?? 0)
        return <circle key={metric.key} cx={point.x} cy={point.y} r="4" fill="#fc0c97" />
      })}
    </svg>
  )
}
