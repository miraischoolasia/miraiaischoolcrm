import { formatDate } from '../domain/studentStatus'
import { pathwayMetricColors, performanceMetricDefinitions } from '../lib/constants'
import { LESSONS_PER_STAGE, type PathwayStage } from '../lib/pathway'
import { printPathwayReport } from '../lib/pathwayReport'
import { PathwayLineChart } from './PathwayLineChart'

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-slate-300">-</span>
  if (delta > 0) return <span className="text-emerald-600">▲ +{delta.toFixed(1)}</span>
  if (delta < 0) return <span className="text-rose-600">▼ {delta.toFixed(1)}</span>
  return <span className="text-slate-500">▬ 0.0</span>
}

export function PathwaySection({
  studentName,
  stages,
}: {
  studentName: string
  stages: PathwayStage[]
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Learning Pathway</h3>
          <p className="mt-1 text-sm text-slate-500">
            Average score per stage of {LESSONS_PER_STAGE} reviewed lessons. Trial is shown
            separately; absent and leave lessons are not counted.
          </p>
        </div>
        {stages.length > 0 && (
          <button
            type="button"
            onClick={() => printPathwayReport(studentName, stages)}
            className="shrink-0 self-start rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Export Parent Report (PDF)
          </button>
        )}
      </div>

      {stages.length === 0 && (
        <div className="px-4 py-14 text-center text-sm text-slate-500">
          The pathway appears once this student has reviewed lessons.
        </div>
      )}

      {stages.length > 0 && (
        <div className="space-y-5 p-5">
          <PathwayLineChart stages={stages} />

          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {performanceMetricDefinitions.map((metric) => (
              <span
                key={metric.key}
                className="inline-flex items-center gap-1.5 text-xs text-slate-600"
              >
                <i
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: pathwayMetricColors[metric.key] }}
                />
                {metric.label}
              </span>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-slate-500">
                  <th className="px-2 py-2 text-left font-semibold">Skill</th>
                  {stages.map((stage) => (
                    <th key={stage.label} className="px-2 py-2 text-center font-semibold">
                      {stage.label}
                      {stage.inProgress ? '*' : ''}
                      <div className="font-normal text-slate-400">
                        {formatDate(stage.startDate)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {performanceMetricDefinitions.map((metric) => (
                  <tr key={metric.key} className="border-b border-slate-100">
                    <td className="px-2 py-2 text-slate-700">{metric.label}</td>
                    {stages.map((stage) => {
                      const score = stage.averages[metric.scoreField]
                      return (
                        <td key={stage.label} className="px-2 py-2 text-center">
                          <div className="font-semibold text-slate-900">
                            {score === null ? '-' : score.toFixed(1)}
                          </div>
                          <div className="text-xs">
                            <DeltaBadge delta={stage.deltas[metric.scoreField]} />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {stages.some((stage) => stage.inProgress) && (
              <p className="mt-2 text-xs text-slate-500">
                * Stage in progress (fewer than {LESSONS_PER_STAGE} lessons so far).
              </p>
            )}
          </div>

          <div className="space-y-3">
            {stages
              .filter((stage) => stage.remarks.length > 0)
              .map((stage) => (
                <details
                  key={stage.label}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    {stage.label} teacher remarks ({stage.remarks.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-sm text-slate-600">
                    {stage.remarks.map((remark, index) => (
                      <li key={`${remark.lessonDate}-${index}`}>
                        <span className="text-slate-400">{formatDate(remark.lessonDate)}</span>{' '}
                        <span className="font-medium">{remark.metricLabel}:</span> {remark.text}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
          </div>
        </div>
      )}
    </section>
  )
}
