export type LeadTrendPoint = {
  label: string
  value: number
  color?: string
}

export function LeadTrendChart({ data }: { data: LeadTrendPoint[] }) {
  const width = 520
  const height = 180
  const paddingX = 28
  const paddingTop = 28
  const paddingBottom = 26
  const innerWidth = width - paddingX * 2
  const innerHeight = height - paddingTop - paddingBottom
  const maxValue = Math.max(1, ...data.map((point) => point.value))
  const stepX = data.length > 1 ? innerWidth / (data.length - 1) : 0

  const points = data.map((point, index) => ({
    ...point,
    x: paddingX + stepX * index,
    y: paddingTop + innerHeight - (point.value / maxValue) * innerHeight,
  }))

  const linePath = points.reduce((path, point, index) => {
    if (index === 0) {
      return `M ${point.x},${point.y}`
    }
    const previous = points[index - 1]
    const midX = (previous.x + point.x) / 2
    return `${path} C ${midX},${previous.y} ${midX},${point.y} ${point.x},${point.y}`
  }, '')

  const baseline = paddingTop + innerHeight
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x},${baseline} L ${points[0].x},${baseline} Z`
      : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[180px] w-full">
      {areaPath && <path d={areaPath} fill="#fc0c9714" stroke="none" />}
      {linePath && (
        <path d={linePath} fill="none" stroke="#fc0c97" strokeWidth="2.5" strokeLinecap="round" />
      )}
      {points.map((point) => (
        <g key={point.label}>
          <circle
            cx={point.x}
            cy={point.y}
            r="5"
            fill={point.color ?? '#fc0c97'}
            stroke="#ffffff"
            strokeWidth="2"
          />
          <text
            x={point.x}
            y={point.y - 12}
            textAnchor="middle"
            className="fill-slate-700 text-[11px] font-semibold"
          >
            {point.value}
          </text>
          <text
            x={point.x}
            y={height - 6}
            textAnchor="middle"
            className="fill-slate-500 text-[10px] font-medium"
          >
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
