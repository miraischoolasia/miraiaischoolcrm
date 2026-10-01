import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PathwayLineChart } from '../components/PathwayLineChart'
import { formatDate } from '../domain/studentStatus'
import { pathwayMetricColors, performanceMetricDefinitions } from './constants'
import type { PathwayStage } from './pathway'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function formatDelta(delta: number | null) {
  if (delta === null) return '<span style="color:#94a3b8">-</span>'
  if (delta > 0) return `<span style="color:#059669">&#9650; +${delta.toFixed(1)}</span>`
  if (delta < 0) return `<span style="color:#dc2626">&#9660; ${delta.toFixed(1)}</span>`
  return '<span style="color:#64748b">&#9644; 0.0</span>'
}

/**
 * Parent-facing progress report. Deliberately omits teacher remarks: they are
 * internal notes (low scores require one) and are not written for parents.
 */
export function buildPathwayReportHtml(studentName: string, stages: PathwayStage[]) {
  const chart = renderToStaticMarkup(createElement(PathwayLineChart, { stages }))

  const legend = performanceMetricDefinitions
    .map(
      (metric) =>
        `<span style="display:inline-flex;align-items:center;gap:6px;margin-right:16px;font-size:12px;color:#334155">` +
        `<i style="width:10px;height:10px;border-radius:50%;background:${pathwayMetricColors[metric.key]};display:inline-block"></i>${escapeHtml(metric.label)}</span>`,
    )
    .join('')

  const headerCells = stages
    .map(
      (stage) =>
        `<th style="text-align:center;padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px">${escapeHtml(stage.label)}${stage.inProgress ? '*' : ''}<div style="font-weight:400;color:#64748b">${escapeHtml(formatDate(stage.startDate))}</div></th>`,
    )
    .join('')

  const rows = performanceMetricDefinitions
    .map((metric) => {
      const cells = stages
        .map((stage) => {
          const score = stage.averages[metric.scoreField]
          return `<td style="text-align:center;padding:8px;border-bottom:1px solid #f1f5f9;font-size:13px"><strong>${score === null ? '-' : score.toFixed(1)}</strong><div style="font-size:11px">${formatDelta(stage.deltas[metric.scoreField])}</div></td>`
        })
        .join('')
      return `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;font-size:13px">${escapeHtml(metric.label)}</td>${cells}</tr>`
    })
    .join('')

  const hasInProgress = stages.some((stage) => stage.inProgress)

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(studentName)} - Progress Report</title>
<style>
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 32px; }
  @page { margin: 16mm; }
</style></head>
<body>
  <div style="font-size:12px;font-weight:600;color:#be185d;letter-spacing:.08em">MIRAI AI SCHOOL</div>
  <h1 style="margin:4px 0 0;font-size:24px">${escapeHtml(studentName)} &mdash; Progress Report</h1>
  <p style="margin:6px 0 20px;color:#64748b;font-size:13px">Average score (1&ndash;5) across five skills, per stage of ${stages.length > 0 ? '4 lessons' : 'lessons'}.</p>
  ${chart}
  <div style="margin:12px 0 20px;text-align:center">${legend}</div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;font-size:12px">Skill</th>${headerCells}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${hasInProgress ? '<p style="margin-top:12px;font-size:11px;color:#64748b">* Stage still in progress (fewer than 4 lessons so far).</p>' : ''}
</body></html>`
}

// Prints the report through a hidden iframe (not a pop-up, so blockers can't
// stop it); the print dialog's "Save as PDF" produces the file.
export function printPathwayReport(studentName: string, stages: PathwayStage[]) {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  frame.onload = () => {
    const frameWindow = frame.contentWindow
    if (!frameWindow) {
      frame.remove()
      return
    }
    frameWindow.onafterprint = () => frame.remove()
    frameWindow.focus()
    frameWindow.print()
  }
  frame.srcdoc = buildPathwayReportHtml(studentName, stages)
  document.body.appendChild(frame)
}
