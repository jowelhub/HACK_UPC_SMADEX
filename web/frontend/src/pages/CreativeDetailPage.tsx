import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
import { timeseriesMetricFromKpiGoal } from '../lib/performanceFormat'
import { pathAdvertiser, pathCampaign, pathHome, pathCreativeHealthLab } from '../lib/routes'
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
    () => {
      if (!advertiser || !campaign || !creative || !dates.from || !dates.to || !data) return null
      return buildPerformanceInsightContext({
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
          `Creative health score: ${creative.health_score != null ? creative.health_score : 'none'}`,
          'Focus the insight on Post-Launch Copilot (Interactive Hazard) and Creative Explainability (Health & Risk Factors).',
        ],
        dateFrom: dates.from,
        dateTo: dates.to,
        data,
        creativeSignals: {
          healthScore: creative.health_score ?? null,
          shapJson: creative.shap_json ?? null,
          dailyHazardsJson: creative.daily_hazards_json ?? null,
          fatigueDay: creative.fatigue_day ?? null,
        },
      })
    },
    [
      advertiser?.advertiser_id,
      campaign?.campaign_id,
      creative?.creative_id,
      dates.from,
      dates.to,
      !!data, // Only re-memoize when data goes from null to present
    ],
  )


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
        <div className="flex items-center gap-4">
          <Link
            to={pathCreativeHealthLab(advertiser.slug, campaign.slug, creative.slug)}
            className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-brand/10 px-5 py-2.5 text-sm font-bold text-brand ring-1 ring-brand/30 transition-all hover:bg-brand hover:text-white hover:ring-brand hover:shadow-lg hover:shadow-brand/20 active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            <svg className="h-5 w-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            <span className="relative z-10">Survivability Lab</span>
          </Link>
          <DateRangeFields dateRange={dateRange} dates={dates} onChange={setDates} />
        </div>
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
          />
        </div>


      </div>
    </div>
  )
}
