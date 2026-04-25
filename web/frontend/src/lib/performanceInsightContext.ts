import type { PerformanceQueryResponse } from './api'
import { fmt, fmtPct } from './performanceFormat'

export type InsightEntityKind = 'advertiser' | 'campaign' | 'creative'

function timeseriesDigest(ts: Array<Record<string, unknown>> | undefined): string | null {
  if (!ts?.length) return null
  const sorted = [...ts].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const line = (row: Record<string, unknown>, label: string) => {
    const spend = Number(row.spend_usd ?? 0)
    const ctr = row.ctr
    const ctrN = typeof ctr === 'number' && !Number.isNaN(ctr) ? ctr : null
    return `${label} ${row.date}: spend USD ${fmt(spend, 2)}, CTR ${ctrN !== null ? fmtPct(ctrN) : '-'}`
  }
  if (sorted.length === 1) {
    return `Daily series (1 day): ${line(first, 'Day')}.`
  }
  return `Daily series (${sorted.length} days): ${line(first, 'First day')}; ${line(last, 'last day')}.`
}

function breakdownDigest(
  entity: InsightEntityKind,
  breakdown: Array<Record<string, unknown>> | undefined,
  title: 'campaigns' | 'creatives',
  limit = 6,
): string | null {
  if (entity === 'creative' || !breakdown?.length) return null
  const rows = [...breakdown].sort((a, b) => Number(b.spend_usd ?? 0) - Number(a.spend_usd ?? 0)).slice(0, limit)
  const lines = rows.map((r) => {
    const name = String(r.label ?? r.campaign_id ?? r.creative_id ?? '?').slice(0, 48)
    const spend = Number(r.spend_usd ?? 0)
    const imps = Number(r.impressions ?? 0)
    const ctr = r.ctr
    const ctrN = typeof ctr === 'number' && !Number.isNaN(ctr) ? ctr : null
    const roas = r.roas
    const roasN = typeof roas === 'number' && !Number.isNaN(roas) ? roas : null
    return `  — ${name}: spend USD ${fmt(spend, 0)}, impressions ${fmt(imps, 0)}, CTR ${ctrN !== null ? fmtPct(ctrN) : '-'}, ROAS ${roasN !== null ? fmt(roasN, 2) : '-'}`
  })
  return `Top ${title} by spend (up to ${limit}):\n${lines.join('\n')}`
}

/**
 * Builds the user message sent to `/api/agent/insight` (Gemma), aligned with dashboard KPI cards.
 */
export function buildPerformanceInsightContext(params: {
  entity: InsightEntityKind
  headline: string
  subtitleLines: string[]
  dateFrom: string
  dateTo: string
  data: PerformanceQueryResponse | null
}): string | null {
  const { entity, headline, subtitleLines, dateFrom, dateTo, data } = params
  const summary = data?.summary
  if (!summary) return null

  const s = summary
  const perfBlock = [
    'PERFORMANCE (aggregated for the selected date range and filters)',
    `SPEND (USD): ${fmt(s.total_spend_usd as number, 0)}`,
    `IMPRESSIONS: ${fmt(s.total_impressions as number, 0)}`,
    `CLICKS: ${fmt(s.total_clicks as number, 0)}`,
    `CONVERSIONS: ${fmt(s.total_conversions as number, 0)}`,
    `REVENUE (USD): ${fmt(s.total_revenue_usd as number)}`,
    `VIEWABILITY: ${fmtPct(s.overall_viewability_rate as number)}`,
    `CTR: ${fmtPct(s.overall_ctr as number)}`,
    `CPA (USD): ${fmt(s.overall_cpa_usd as number)}`,
    `CVR: ${fmtPct(s.overall_cvr as number)}`,
    `IPM: ${fmt(s.overall_ipm as number)}`,
    `ROAS: ${fmt(s.overall_roas as number)}`,
    `ROWS (fact rows in window): ${fmt(data.row_count, 0)}`,
    `CALENDAR DAYS IN WINDOW: ${fmt(s.calendar_days_in_window as number, 0)}`,
    `DISTINCT CAMPAIGNS: ${fmt(s.distinct_campaigns as number, 0)}`,
    `DISTINCT CREATIVES: ${fmt(s.distinct_creatives as number, 0)}`,
  ].join('\n')

  const scopeBlock = [
    `SCOPE: ${entity.toUpperCase()}`,
    `HEADLINE: ${headline}`,
    ...subtitleLines.filter(Boolean).map((l) => `DETAIL: ${l}`),
    `DATE RANGE: ${dateFrom} through ${dateTo}`,
  ].join('\n')

  const tsLine = timeseriesDigest(data.timeseries)
  const bd =
    entity === 'advertiser'
      ? breakdownDigest(entity, data.breakdown, 'campaigns')
      : entity === 'campaign'
        ? breakdownDigest(entity, data.breakdown, 'creatives')
        : null

  const extra = [tsLine, bd].filter(Boolean).join('\n\n')
  return [scopeBlock, '', perfBlock, extra ? `\n${extra}` : ''].join('\n')
}
