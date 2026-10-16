import { toFivePointScale, type ReviewMetric } from '../lib/reviewCriteria'

// One axis per criterion; every criterion is drawn on 1-5 whatever its own
// top score.
export function PerformanceRadarChart({
  averages,
  metrics,
}: {
  // By criterion id, on the criterion's own scale (0 = no score yet).
  averages: Record<number, number>
  metrics: ReviewMetric[]
}) {
  const size = 240
  const center = size / 2
  const radius = 74

  function getPoint(index: number, value: number) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(metrics.length, 1)
    const scaledRadius = (Math.max(0, Math.min(5, value)) / 5) * radius
    return {
      x: center + Math.cos(angle) * scaledRadius,
      y: center + Math.sin(angle) * scaledRadius,
    }
  }

  const scaled = (metric: ReviewMetric) => {
    const value = averages[metric.id] ?? 0
    return value > 0 ? toFivePointScale(value, metric.maxScore) : 0
  }

  const polygonPoints = metrics
    .map((metric, index) => {
      const point = getPoint(index, scaled(metric))
      return `${point.x},${point.y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[230px] w-[230px]">
      {[1, 2, 3, 4, 5].map((level) => {
        const levelPoints = metrics
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

      {metrics.map((metric, index) => {
        const edgePoint = getPoint(index, 5)
        const labelPoint = getPoint(index, 5.8)
        return (
          <g key={metric.id}>
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

      {metrics.map((metric, index) => {
        const point = getPoint(index, scaled(metric))
        return <circle key={metric.id} cx={point.x} cy={point.y} r="4" fill="#fc0c97" />
      })}
    </svg>
  )
}
