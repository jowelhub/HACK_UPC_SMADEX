import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import { ResponsiveChartWrapper } from './ResponsiveChartWrapper'
import type { CampaignCreativePcaPoint, CampaignCreativePcaResponse } from '../lib/api'
import { CAMPAIGN_PCA_SECTION } from '../lib/performanceLabels'
import { explorerUi } from '../lib/explorerUi'

function statusFill(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase().replace(/\s+/g, '_')
  if (s === 'stable') return '#64748b'
  if (s === 'fatigued') return '#ef4444'
  if (s === 'underperformer') return '#ca8a04'
  if (s === 'top_performer') return '#16a34a'
  return '#7c3aed'
}

function pct(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return '0'
  return (n * 100).toFixed(1)
}

function scatterShape(props: {
  cx?: number
  cy?: number
  payload?: CampaignCreativePcaPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={9}
      fill={statusFill(payload?.creative_status)}
      stroke="#ffffff"
      strokeWidth={1.5}
    />
  )
}

type Props = {
  data: CampaignCreativePcaResponse | null
  error: string | null
  loading: boolean
}

export function CampaignCreativePcaSection({ data, error, loading }: Props) {
  const points = data?.points ?? []
  const evr = data?.explained_variance_ratio ?? []

  if (error) {
    return (
      <div className="mb-0">
        <h2 className={explorerUi.performanceLabel}>{CAMPAIGN_PCA_SECTION.heading}</h2>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mb-0">
        <h2 className={explorerUi.performanceLabel}>{CAMPAIGN_PCA_SECTION.heading}</h2>
        <p className="text-sm text-stone-500">Loading PCA…</p>
      </div>
    )
  }

  if (!data || points.length < 2) {
    return (
      <div className="mb-0">
        <h2 className={explorerUi.performanceLabel}>{CAMPAIGN_PCA_SECTION.heading}</h2>
        <p className="text-sm text-stone-500">Need at least two creatives in this campaign for a PCA plot.</p>
      </div>
    )
  }

  const pc1Pct = pct(evr[0])
  const pc2Pct = pct(evr[1])

  return (
    <div className="mb-0">
      <h2 className={explorerUi.performanceLabel}>{CAMPAIGN_PCA_SECTION.heading}</h2>
      <div className="surface-panel w-full max-w-4xl p-2 sm:p-3">
        <div style={{ height: 220 }}>
          <ResponsiveChartWrapper>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 12, bottom: 30, left: 34 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis
                  type="number"
                  dataKey="pc1"
                  tick={{ fill: '#78716c', fontSize: 11 }}
                  label={{ value: `PC1 (${pc1Pct}% variance)`, position: 'bottom', offset: 12, fill: '#57534e', fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="pc2"
                  tick={{ fill: '#78716c', fontSize: 11 }}
                  label={{ value: `PC2 (${pc2Pct}% variance)`, angle: -90, position: 'insideLeft', dx: -18, dy: 22, fill: '#57534e', fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const p = payload[0].payload as CampaignCreativePcaPoint
                    const st = p.creative_status ? p.creative_status.replace(/_/g, ' ') : '—'
                    return (
                      <div className="max-w-xs rounded-md border border-stone-200 bg-white px-2.5 py-2 text-xs font-medium text-stone-700 shadow-sm">
                        Creative #{p.creative_id} · {st}
                      </div>
                    )
                  }}
                />
                <Scatter name="Creatives" data={points} shape={scatterShape} />
              </ScatterChart>
            </ResponsiveContainer>
          </ResponsiveChartWrapper>
        </div>
      </div>
    </div>
  )
}
