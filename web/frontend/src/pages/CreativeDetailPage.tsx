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
import { PERFORMANCE_SECTION, UI_COPY, formatMetaLine } from '../lib/performanceLabels'
import { buildCreativeFilters } from '../lib/performanceQueryDefaults'
import { buildPerformanceInsightContext } from '../lib/performanceInsightContext'
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

  const insightContext = useMemo(
    () =>
      advertiser && campaign && creative && dates.from && dates.to
        ? buildPerformanceInsightContext({
            entity: 'creative',
            headline: creative.label,
            subtitleLines: [
              `Advertiser: ${advertiser.label}`,
              `Campaign: ${campaign.label}`,
              `Creative ID ${creative.creative_id}`,
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
          <h1 className={explorerUi.title}>{creative.label}</h1>
          <p className={explorerUi.subtitle}>
            {formatMetaLine(advertiser.label, `Creative #${creative.creative_id}`)}
          </p>
          {creative.creative_status != null ||
          creative.perf_score != null ||
          creative.fatigue_day != null ||
          creative.is_fatigued ? (
            <div className="mt-3 max-w-xl rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800">
              <p className="font-medium text-stone-900">Creative summary (seeded)</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-stone-700">
                {creative.creative_status != null ? (
                  <li>
                    Status: <span className="font-medium">{creative.creative_status.replace(/_/g, ' ')}</span>
                    {creative.is_fatigued ? ' — flagged as fatigued in dataset' : ''}
                  </li>
                ) : null}
                {creative.perf_score != null ? (
                  <li>Performance score: {creative.perf_score.toFixed(3)} (0–1)</li>
                ) : null}
                {creative.fatigue_day != null ? <li>Fatigue day (label): day {creative.fatigue_day}</li> : null}
              </ul>
            </div>
          ) : null}
        </div>
        <DateRangeFields dateRange={dateRange} dates={dates} onChange={setDates} />
      </div>

      <div className="isolate overflow-hidden rounded-lg border border-stone-200 bg-white p-4">
        <div className="mx-auto flex w-full max-w-2xl justify-center">
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

      <div className="relative z-10 min-h-0">
        <h2 className={explorerUi.performanceLabel}>{PERFORMANCE_SECTION.heading}</h2>
        <PerformanceResultPanels
          data={data}
          err={err}
          breakdownTitle={null}
          compactMetrics
          lockDailySeriesToKpiGoal
          kpiGoal={campaign.kpi_goal ?? null}
        />
        <CreativeCrossDimensionSection data={data} queryError={err} />
        <LlmInsightPanel context={insightContext} performanceError={err} />
      </div>
    </div>
  )
}
