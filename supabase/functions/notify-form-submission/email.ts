// The email sent to staff when someone finishes a form. Kept apart from the
// function itself so it can be tested without Deno.

export type EmailAnswer = { label: string; value: string }
export type EmailTracking = Record<string, string> | null

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function oneLine(value: string) {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

export function buildSubmissionEmail(
  formName: string,
  answers: EmailAnswer[],
  tracking: EmailTracking,
  appUrl: string,
) {
  const name = oneLine(formName) || 'your form'
  const from = tracking
    ? [tracking.source, tracking.medium, tracking.campaign].filter(Boolean).join(' / ') ||
      tracking.referrer ||
      ''
    : ''

  const text = [
    `Someone just filled in "${name}".`,
    '',
    ...answers.map((answer) => `${answer.label}: ${answer.value}`),
    ...(from ? ['', `Came from: ${from}`] : []),
    ...(appUrl ? ['', `Open the CRM: ${appUrl}`] : []),
  ].join('\n')

  const rows = answers
    .map(
      (answer) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${escapeHtml(answer.label)}</td>` +
        `<td style="padding:4px 0;white-space:pre-wrap">${escapeHtml(answer.value)}</td></tr>`,
    )
    .join('')

  const html =
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a">` +
    `<p>Someone just filled in <strong>${escapeHtml(name)}</strong>.</p>` +
    `<table style="border-collapse:collapse">${rows}</table>` +
    (from ? `<p style="color:#64748b">Came from: ${escapeHtml(from)}</p>` : '') +
    (appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open the CRM</a></p>` : '') +
    `</div>`

  return { subject: `New submission: ${name}`.slice(0, 200), text, html }
}
