import { useEffect, useState } from 'react'
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { CampaignCreativePcaPoint, CampaignCreativePcaResponse } from '../lib/api'
import { fetchCampaignCreativePca } from '../lib/api'
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
  campaignId: number
}

export function CampaignCreativePcaSection({ campaignId }: Props) {
  const [data, setData] = useState<CampaignCreativePcaResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setErr(null)
    setData(null)
    void fetchCampaignCreativePca(campaignId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [campaignId])

  const points = data?.points ?? []
  const evr = data?.explained_variance_ratio ?? []
  const nFeat = data?.n_features_used

  if (err) {
    return (
      <div className="mb-6">
        <h2 className={explorerUi.sectionTitle}>{CAMPAIGN_PCA_SECTION.heading}</h2>
        <p className="text-sm text-red-600">{err}</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="mb-6">
        <h2 className={explorerUi.sectionTitle}>{CAMPAIGN_PCA_SECTION.heading}</h2>
        <p className="text-sm text-stone-500">Loading PCA…</p>
      </div>
    )
  }

  if (points.length < 2) {
    return (
      <div className="mb-6">
        <h2 className={explorerUi.sectionTitle}>{CAMPAIGN_PCA_SECTION.heading}</h2>
        <p className="text-sm text-stone-500">Need at least two creatives in this campaign for a PCA plot.</p>
      </div>
    )
  }

  const pc1Pct = pct(evr[0])
  const pc2Pct = pct(evr[1])

  return (
    <div className="mb-6">
      <h2 className={explorerUi.sectionTitle}>{CAMPAIGN_PCA_SECTION.heading}</h2>
      <p className="mb-3 max-w-3xl text-sm text-stone-600">{CAMPAIGN_PCA_SECTION.subline}</p>
      {nFeat != null ? (
        <p className="mb-2 text-xs text-stone-500">
          Numeric features used: <span className="font-medium text-stone-700">{nFeat}</span>
        </p>
      ) : null}
      <div className="surface-panel min-h-[14rem] w-full max-w-4xl p-3 sm:min-h-[16rem] sm:p-4">
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 12, right: 20, bottom: 28, left: 16 }}>
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
              label={{ value: `PC2 (${pc2Pct}% variance)`, angle: -90, position: 'insideLeft', fill: '#57534e', fontSize: 11 }}
            />
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as CampaignCreativePcaPoint
                const st = p.creative_status ? p.creative_status.replace(/_/g, ' ') : '—'
                return (
                  <div className="max-w-xs rounded-md border border-stone-200 bg-white px-2.5 py-2 text-xs shadow-sm">
                    <div className="font-semibold text-stone-900">{p.label}</div>
                    <div className="mt-0.5 text-stone-600">
                      Creative #{p.creative_id} · {st}
                    </div>
                  </div>
                )
              }}
            />
            <Scatter name="Creatives" data={points} shape={scatterShape} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" /> stable
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> fatigued
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-600" /> underperformer
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-600" /> top performer
        </li>
      </ul>
    </div>
  )
}
