import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, ReferenceLine } from 'recharts'
import { useParams } from 'react-router-dom'
import { BackNavLink } from '../components/BackNavLink'
import { CreativeCrossDimensionSection } from '../components/CreativeCrossDimensionSection'
import { DateRangeFields } from '../components/DateRangeFields'
import { LlmInsightPanel } from '../components/LlmInsightPanel'
import { PerformanceResultPanels } from '../components/PerformanceResultPanels'
import { creativeAssetUrl } from '../lib/api'
import { useExplorerBootstrap } from '../hooks/useExplorerBootstrap'
import { usePerformanceSlice } from '../hooks/usePerformanceSlice'
import {
  findAdvertiserBySlug,
  findCampaignBySlug,
  findCreativeBySlug,
} from '../lib/hierarchyResolve'
import { UI_COPY } from '../lib/performanceLabels'
import { buildCreativeFilters } from '../lib/performanceQueryDefaults'
import { buildPerformanceInsightContext } from '../lib/performanceInsightContext'
import { fmt, fmtPct, timeseriesMetricFromKpiGoal } from '../lib/performanceFormat'
import { pathAdvertiser, pathCampaign, pathHome } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'

export function CreativeDetailPage() {
  const { advertiserSlug, campaignSlug, creativeSlug } = useParams<{
    advertiserSlug: string
    campaignSlug: string
    creativeSlug: string
  }>()
  const { advertisers, error: loadErr, dateRange, dates, setDates } = useExplorerBootstrap()

  const advertiser = useMemo(() => findAdvertiserBySlug(advertisers, advertiserSlug), [advertisers, advertiserSlug])
  const campaign = useMemo(() => findCampaignBySlug(advertiser, campaignSlug), [advertiser, campaignSlug])
  const creative = useMemo(() => findCreativeBySlug(campaign, creativeSlug), [campaign, creativeSlug])

  const filters = useMemo(() => {
    if (!advertiser || !creative || !dates.from || !dates.to) return null
    return buildCreativeFilters(advertiser.advertiser_id, creative.creative_id, dates)
  }, [advertiser, creative, dates.from, dates.to])

  const creativeSliceOpts = useMemo(
    () => ({ extraBreakdowns: ['country', 'os', 'format'] as const }),
    [],
  )
  const { data, err } = usePerformanceSlice(filters, null, creativeSliceOpts)

  const insightPack = useMemo(
    () =>
      advertiser && campaign && creative && dates.from && dates.to
        ? buildPerformanceInsightContext({
            entity: 'creative',
            headline: creative.label,
            subtitleLines: [
              `Advertiser: ${advertiser.label}`,
              `Campaign: ${campaign.label}`,
              `Creative ID ${creative.creative_id}`,
              `KPI goal: ${(campaign.kpi_goal ?? 'CPA').trim() || 'CPA'}`,
              `Total spend (selected range): ${data?.summary?.total_spend_usd != null ? Number(data.summary.total_spend_usd).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 'none'}`,
              `Seeded status: ${(creative.creative_status ?? 'none').replace(/_/g, ' ')}`,
              `Fatigue day: ${creative.fatigue_day != null ? `day ${creative.fatigue_day}` : 'none'}`,
              `Health Score: ${creative.health_score != null ? `${creative.health_score}/100` : 'none'}`,
            ],
            dateFrom: dates.from,
            dateTo: dates.to,
            data,
          })
        : null,
    [advertiser, campaign, creative, dates.from, dates.to, data],
  )

  const fallbackInsight = useMemo(() => {
    if (!campaign || !creative || !data?.summary) return null
    const summary = data.summary
    const kpiGoal = (campaign.kpi_goal ?? 'CPA').trim() || 'CPA'
    const status = creative.creative_status ? creative.creative_status.replace(/_/g, ' ').toLowerCase() : 'none'
    const fatigue = creative.fatigue_day != null ? `day ${creative.fatigue_day}` : 'none'
    return [
      `KPI goal is ${kpiGoal}.`,
      `Total spend in the selected range is ${fmt(summary.total_spend_usd as number, 0)} USD.`,
      `Current delivery shows CTR ${fmtPct(summary.overall_ctr as number)}, CPA ${fmt(summary.overall_cpa_usd as number)} USD, and ROAS ${fmt(summary.overall_roas as number)}.`,
      `Seeded status is ${status} and fatigue day is ${fatigue}.`,
      `The creative health score is ${creative.health_score != null ? creative.health_score : 'unknown'}.`,
    ].join(' ')
  }, [campaign, creative, data])

  const [imgOk, setImgOk] = useState(true)
  useEffect(() => {
    setImgOk(true)
  }, [creative?.creative_id])

  if (loadErr) {
    return <p className={explorerUi.errorMessage}>{loadErr}</p>
  }

  if (advertisers && advertiser && (!campaign || !creative)) {
    const backTarget = campaign
      ? pathCampaign(advertiser.slug, campaign.slug)
      : pathAdvertiser(advertiser.slug)
    return (
      <div className={explorerUi.notFoundWrap}>
        <BackNavLink to={backTarget}>← Back</BackNavLink>
        <p className={explorerUi.notFoundBody}>{UI_COPY.creativeOrCampaignNotFound}</p>
      </div>
    )
  }

  if (advertisers && !advertiser) {
    return (
      <div className={explorerUi.notFoundWrap}>
        <BackNavLink to={pathHome()}>{UI_COPY.backToAdvertisers}</BackNavLink>
        <p className={explorerUi.notFoundBody}>{UI_COPY.unknownAdvertiser}</p>
      </div>
    )
  }

  if (!advertiser || !campaign || !creative) {
    return <p className={explorerUi.mutedMessage}>{UI_COPY.loading}</p>
  }

  return (
    <div className={explorerUi.pageWrap}>
      <div className={explorerUi.headerRow}>
        <div>
          <BackNavLink to={pathCampaign(advertiser.slug, campaign.slug)}>← {campaign.label}</BackNavLink>
          <div className="flex items-center gap-3">
            <h1 className={explorerUi.title}>Creative #{creative.creative_id}</h1>
          </div>
        </div>
        <DateRangeFields dateRange={dateRange} dates={dates} onChange={setDates} />
      </div>

      <div className="relative z-10 min-h-0">
        <PerformanceResultPanels
          data={data}
          err={err}
          breakdownTitle={null}
          compactMetrics
          lockDailySeriesToKpiGoal
          kpiGoal={campaign.kpi_goal ?? null}
          creativeSummary={{
            status: creative.creative_status ?? null,
            fatigueDay: creative.fatigue_day ?? null,
          }}
        />
        <CreativeCrossDimensionSection
          data={data}
          queryError={err}
          fixedMetric={timeseriesMetricFromKpiGoal(campaign.kpi_goal ?? null)}
        />
        <div className="mt-5 grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
          <div className="isolate overflow-hidden rounded-lg border border-stone-200 bg-white p-4">
            <div className="mx-auto flex h-full w-full max-w-2xl justify-center">
              {imgOk ? (
                <img
                  src={creativeAssetUrl(creative.creative_id)}
                  alt=""
                  className="mx-auto max-h-[min(52dvh,28rem)] w-full max-w-full object-contain"
                  onError={() => setImgOk(false)}
                />
              ) : (
                <p className="py-12 text-center text-sm text-stone-500">{UI_COPY.noImage}</p>
              )}
            </div>
          </div>
          <LlmInsightPanel
            context={insightPack?.context ?? null}
            insightMode={insightPack?.insightMode}
            performanceError={err}
            panelClassName="mt-0 h-full"
            fallbackText={fallbackInsight}
          />
        </div>

        {/* Explainability Section */}
        {creative.health_score != null && creative.shap_json && (
          <div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-stone-900">Creative Explainability (Health & Risk Factors)</h2>
              <p className="mt-1 text-sm text-stone-500">
                Understanding what drives this creative's performance based on its innate features.
              </p>
            </div>
            
            <div className="flex flex-col gap-8 md:flex-row">
              {/* Health Score Panel */}
              <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-stone-50 p-6 md:w-48">
                <div className="text-sm font-medium text-stone-500">Health Score</div>
                <div className="relative mt-4 flex h-32 w-8 flex-col-reverse overflow-hidden rounded-full bg-stone-200">
                  <div 
                    className={`w-full transition-all duration-500 ${creative.health_score >= 60 ? 'bg-green-500' : creative.health_score >= 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
                    style={{ height: `${creative.health_score}%` }}
                  />
                </div>
                <div className={`mt-4 text-4xl font-black ${
                  creative.health_score >= 60 ? 'text-green-600' : creative.health_score >= 30 ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {creative.health_score}
                </div>
              </div>

              {/* Factors (SHAP) */}
              <div className="flex-1 rounded-lg border border-stone-100 bg-white p-4">
                <h3 className="mb-4 text-sm font-bold text-stone-800">Feature Impact (SHAP)</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={creative.shap_json.factors}
                      margin={{ top: 0, right: 20, left: 40, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="feature" 
                        type="category" 
                        axisLine={false} 
                        tickLine={false}
                        tick={{ fontSize: 12, fill: '#57534e' }}
                        tickFormatter={(val) => val.replace(/_/g, ' ')}
                      />
                      <Tooltip 
                        formatter={(value: any, _name: any, props: any) => [
                          `${Number(value).toFixed(3)} (Value: ${props.payload.value})`, 
                          'Impact'
                        ]}
                      />
                      <ReferenceLine x={0} stroke="#a8a29e" />
                      <Bar dataKey="shap_value" barSize={16} radius={[0, 4, 4, 0]}>
                        {creative.shap_json.factors?.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.shap_value > 0 ? '#ef4444' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex justify-between text-xs text-stone-500">
                  <span>← Decreases Risk</span>
                  <span>Increases Risk →</span>
                </div>
              </div>
              
              {/* Survival Curve */}
              {creative.shap_json.survival_curve && (
                <div className="flex-1 rounded-lg border border-stone-100 bg-white p-4">
                  <h3 className="mb-4 text-sm font-bold text-stone-800">Estimated Survival Curve</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={creative.shap_json.survival_curve}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                          dataKey="day" 
                          tick={{ fontSize: 12, fill: '#57534e' }} 
                          tickLine={false}
                          axisLine={{ stroke: '#e7e5e4' }}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: '#57534e' }} 
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 1]}
                          tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                        />
                        <Tooltip 
                          labelFormatter={(label) => `Day ${label}`}
                          formatter={(value: any) => [`${(Number(value) * 100).toFixed(1)}%`, 'Survival Prob.']}
                        />
                        <Line 
                          type="stepAfter" 
                          dataKey="prob" 
                          stroke="#8b5cf6" 
                          strokeWidth={2} 
                          dot={false}
                          activeDot={{ r: 4, fill: '#8b5cf6', stroke: '#fff' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 text-center text-xs text-stone-500">
                    Days since launch
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
