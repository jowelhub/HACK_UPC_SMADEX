import { useEffect, useMemo, useState } from 'react'
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
import { timeseriesMetricFromKpiGoal } from '../lib/performanceFormat'
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
            ],
            dateFrom: dates.from,
            dateTo: dates.to,
            data,
          })
        : null,
    [advertiser, campaign, creative, dates.from, dates.to, data],
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
          <h1 className={explorerUi.title}>Creative #{creative.creative_id}</h1>
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
          />
        </div>
      </div>
    </div>
  )
}
