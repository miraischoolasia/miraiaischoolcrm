import { toFivePointScale, type ReviewMetric } from '../lib/reviewCriteria'
import type { PathwayStage } from '../lib/pathway'

// Inline SVG attributes only (no Tailwind classes) so the same markup renders
// correctly inside the standalone print window used for the parent report.
export function PathwayLineChart({ stages, metrics }: { stages: PathwayStage[]; metrics: ReviewMetric[] }) {
  const width = 640
  const height = 280
  const padding = { top: 16, right: 24, bottom: 44, left: 36 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom

  const x = (index: number) =>
    stages.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (plotWidth * index) / (stages.length - 1)
  // Scores are drawn on 1-5 (another top score is stretched to it); 1 sits on
  // the baseline.
  const y = (score: number) => padding.top + plotHeight - ((score - 1) / 4) * plotHeight

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label="Performance pathway by stage"
      style={{ display: 'block', maxWidth: `${width}px`, margin: '0 auto' }}
    >
      {[1, 2, 3, 4, 5].map((level) => (
        <g key={level}>
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={y(level)}
            y2={y(level)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
          <text
            x={padding.left - 10}
            y={y(level)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill="#64748b"
          >
            {level}
          </text>
        </g>
      ))}

      {stages.map((stage, index) => (
        <text
          key={stage.label}
          x={x(index)}
          y={height - padding.bottom + 20}
          textAnchor="middle"
          fontSize="11"
          fontWeight="600"
          fill="#475569"
        >
          {stage.label}
          {stage.inProgress ? '*' : ''}
        </text>
      ))}

      {metrics.map((metric) => {
        const color = metric.color
        const points = stages
          .map((stage, index) => {
            const score = stage.averages[metric.id] ?? null
            return { index, score: score === null ? null : toFivePointScale(score, metric.maxScore) }
          })
          .filter((point): point is { index: number; score: number } => point.score !== null)

        return (
          <g key={metric.id}>
            {points.length > 1 && (
              <polyline
                points={points.map((point) => `${x(point.index)},${y(point.score)}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {points.map((point) => (
              <circle
                key={point.index}
                cx={x(point.index)}
                cy={y(point.score)}
                r="4"
                fill={color}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
}
