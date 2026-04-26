import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, ReferenceLine } from 'recharts'
import { ResponsiveChartWrapper } from '../components/ResponsiveChartWrapper'
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

  const [selectedDay, setSelectedDay] = useState(1)
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
                <div className="h-64 w-full min-w-0 min-h-0">
                  <ResponsiveChartWrapper>
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
                  </ResponsiveChartWrapper>
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
                  <div className="h-64 w-full min-w-0 min-h-0">
                    <ResponsiveChartWrapper>
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
                    </ResponsiveChartWrapper>
                  </div>
                  <div className="mt-2 text-center text-xs text-stone-500">
                    Days since launch
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* POST-LAUNCH INTERACTIVE COPILOT */}
        {creative?.daily_hazards_json && creative.daily_hazards_json.daily_data && creative.daily_hazards_json.daily_data.length > 0 && (
          <div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-6 border-b border-stone-100 pb-4">
              <h2 className="text-xl font-bold text-stone-800">Post-Launch Copilot (Interactive Hazard)</h2>
              <p className="mt-1 text-sm text-stone-500">
                Explore how real-time performance metrics affect this creative's fatigue risk over time using a Time-Varying Cox model.
              </p>
            </div>

            <div className="flex flex-col gap-8 md:flex-row">
              {/* Controls and Stats */}
              <div className="flex w-full flex-col gap-6 md:w-1/3">
                {/* Day Slider */}
                <div className="rounded-lg bg-stone-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <label className="text-sm font-semibold text-stone-700">Timeline (Days Since Launch)</label>
                    <span className="rounded bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">Day {selectedDay}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={creative.daily_hazards_json.max_days}
                    value={selectedDay}
                    onChange={(e) => setSelectedDay(parseInt(e.target.value, 10))}
                    className="w-full cursor-pointer accent-blue-600"
                  />
                  <div className="mt-1 flex justify-between text-xs text-stone-400">
                    <span>Day 1</span>
                    <span>Day {creative.daily_hazards_json.max_days}</span>
                  </div>
                </div>

                {/* Recommendation Panel */}
                {(() => {
                  // Find data for selected day, fallback to last available
                  const dayData = creative.daily_hazards_json.daily_data.find((d: any) => d.day === selectedDay) 
                    || creative.daily_hazards_json.daily_data[creative.daily_hazards_json.daily_data.length - 1]

                  if (!dayData) return null

                  const isScale = dayData.recommendation === 'Scale'
                  const isHold = dayData.recommendation === 'Hold'
                  
                  const bgColor = isScale ? 'bg-green-50' : isHold ? 'bg-yellow-50' : 'bg-red-50'
                  const borderColor = isScale ? 'border-green-200' : isHold ? 'border-yellow-200' : 'border-red-200'
                  const textColor = isScale ? 'text-green-800' : isHold ? 'text-yellow-800' : 'text-red-800'

                  return (
                    <div className={`flex flex-col rounded-lg border p-5 ${bgColor} ${borderColor}`}>
                      <div className="text-sm font-medium text-stone-600">Action Recommendation</div>
                      <div className={`mt-1 text-3xl font-black ${textColor}`}>
                        {dayData.recommendation.toUpperCase()}
                      </div>
                      
                      <div className="mt-4 flex items-baseline gap-2">
                        <span className="text-sm font-medium text-stone-600">Relative Hazard:</span>
                        <span className={`text-xl font-bold ${textColor}`}>{dayData.hazard_score.toFixed(2)}x</span>
                      </div>
                      <p className="mt-2 text-xs text-stone-500">
                        {isScale ? 'Risk is low. Consider scaling spend if ROAS is positive.' :
                         isHold ? 'Risk is accumulating. Monitor closely and hold current spend.' :
                         'High risk of imminent fatigue. Consider pausing or refreshing creative.'}
                      </p>

                      {/* Daily Features */}
                      <div className="mt-4 pt-4 border-t border-stone-200/60">
                        <div className="mb-2 text-xs font-semibold text-stone-500 uppercase tracking-wider">Metrics on Day {selectedDay}</div>
                        <ul className="space-y-1 text-sm text-stone-700">
                          <li className="flex justify-between"><span>CTR vs Peak:</span> <span className="font-medium">{(dayData.features.ctr_vs_peak * 100).toFixed(0)}%</span></li>
                          <li className="flex justify-between"><span>CVR vs Peak:</span> <span className="font-medium">{(dayData.features.cvr_vs_peak * 100).toFixed(0)}%</span></li>
                          <li className="flex justify-between"><span>7D Spend Vel.:</span> <span className="font-medium">${dayData.features.spend_velocity_7d.toFixed(0)}</span></li>
                        </ul>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Trajectory Plot */}
              <div className="flex-1 rounded-lg border border-stone-100 bg-white p-4">
                <h3 className="mb-4 text-sm font-bold text-stone-800">Dynamic Hazard Trajectory</h3>
                <div className="h-72 w-full min-w-0 min-h-0">
                  <ResponsiveChartWrapper>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={creative.daily_hazards_json.daily_data}
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
                          tickFormatter={(val) => `${val}x`}
                        />
                        <Tooltip 
                          labelFormatter={(label) => `Day ${label}`}
                          formatter={(value: any) => [`${Number(value).toFixed(2)}x`, 'Relative Hazard']}
                        />
                        <ReferenceLine y={1.0} stroke="#a8a29e" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Baseline (1x)', fill: '#a8a29e', fontSize: 11 }} />
                        <ReferenceLine y={2.0} stroke="#fca5a5" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'High Risk (2x)', fill: '#fca5a5', fontSize: 11 }} />
                        
                        <ReferenceLine x={selectedDay} stroke="#3b82f6" strokeWidth={2} />
                        
                        <Line 
                          type="monotone" 
                          dataKey="hazard_score" 
                          stroke="#dc2626" 
                          strokeWidth={2} 
                          dot={false}
                          activeDot={{ r: 4, fill: '#dc2626', stroke: '#fff' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ResponsiveChartWrapper>
                </div>
                <div className="mt-2 text-center text-xs text-stone-500">
                  Days since launch
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
