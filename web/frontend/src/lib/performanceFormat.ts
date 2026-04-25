export function clampIsoDate(ymd: string, min?: string, max?: string): string {
  let v = ymd
  if (min && v < min) v = min
  if (max && v > max) v = max
  return v
}

export function fmt(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return `${(n * 100).toFixed(2)}%`
}

export const METRIC_OPTIONS = [
  { key: 'ctr', label: 'CTR' },
  { key: 'cvr', label: 'CVR' },
  { key: 'viewability_rate', label: 'Viewability' },
  { key: 'spend_usd', label: 'Spend (USD)' },
  { key: 'impressions', label: 'Impressions' },
  { key: 'viewable_impressions', label: 'Viewable imps' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'revenue_usd', label: 'Revenue (USD)' },
  { key: 'video_completions', label: 'Video completions' },
  { key: 'cpa_usd', label: 'CPA (USD)' },
  { key: 'ipm', label: 'IPM' },
  { key: 'roas', label: 'ROAS' },
] as const

export type MetricKey = (typeof METRIC_OPTIONS)[number]['key']

export function metricLabel(key: MetricKey): string {
  return METRIC_OPTIONS.find((m) => m.key === key)?.label ?? key
}

function isPct01Metric(key: MetricKey): boolean {
  return key === 'ctr' || key === 'cvr' || key === 'viewability_rate'
}

function isUsdMetric(key: MetricKey): boolean {
  return key === 'spend_usd' || key === 'revenue_usd' || key === 'cpa_usd'
}

export function formatMetricValue(key: MetricKey, v: number): string {
  if (Number.isNaN(v)) return '-'
  if (isPct01Metric(key)) return fmtPct(v)
  if (isUsdMetric(key)) return `$${fmt(v, v >= 100 ? 0 : 2)}`
  if (key === 'roas' || key === 'ipm') return fmt(v, 3)
  return fmt(v, 0)
}

export function formatMetricTick(key: MetricKey, v: number): string {
  if (Number.isNaN(v)) return ''
  if (isPct01Metric(key)) return `${(v * 100).toFixed(1)}%`
  if (isUsdMetric(key) && Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (isUsdMetric(key) && Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`
  if (key === 'roas' || key === 'ipm') return fmt(v, 2)
  return fmt(v, 0)
}

export function otherMetricKey(exclude: MetricKey): MetricKey {
  return METRIC_OPTIONS.find((m) => m.key !== exclude)?.key ?? 'spend_usd'
}

export const chartTooltipStyle = {
  contentStyle: {
    background: '#ffffff',
    border: '1px solid #e7e5e4',
    borderRadius: '4px',
    boxShadow: 'none',
  },
  labelStyle: { color: '#44403c', fontWeight: 600 },
  itemStyle: { color: '#57534e' },
}
