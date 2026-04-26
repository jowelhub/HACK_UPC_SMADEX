import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BackNavLink } from '../components/BackNavLink'
import { CampaignCreativePcaSection } from '../components/CampaignCreativePcaSection'
import { DateRangeFields } from '../components/DateRangeFields'
import { ExplorerCreativeCard } from '../components/ExplorerCreativeCard'
import { LlmInsightPanel } from '../components/LlmInsightPanel'
import { PerformanceResultPanels } from '../components/PerformanceResultPanels'
import { useExplorerBootstrap } from '../hooks/useExplorerBootstrap'
import { usePerformanceSlice } from '../hooks/usePerformanceSlice'
import type { CampaignCreativePcaResponse } from '../lib/api'
import { fetchCampaignCreativePca } from '../lib/api'
import { findAdvertiserBySlug, findCampaignBySlug } from '../lib/hierarchyResolve'
import { PAGE_SECTION, UI_COPY } from '../lib/performanceLabels'
import { buildCampaignFilters } from '../lib/performanceQueryDefaults'
import { buildPerformanceInsightContext } from '../lib/performanceInsightContext'
import { pathAdvertiser, pathCreative, pathHome } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'

export function CampaignDetailPage() {
  const { advertiserSlug, campaignSlug } = useParams<{ advertiserSlug: string; campaignSlug: string }>()
  const { advertisers, error: loadErr, dateRange, dates, setDates } = useExplorerBootstrap()

  const advertiser = useMemo(() => findAdvertiserBySlug(advertisers, advertiserSlug), [advertisers, advertiserSlug])
  const campaign = useMemo(() => findCampaignBySlug(advertiser, campaignSlug), [advertiser, campaignSlug])

  const filters = useMemo(() => {
    if (!advertiser || !campaign || !dates.from || !dates.to) return null
    return buildCampaignFilters(advertiser.advertiser_id, campaign.campaign_id, dates)
  }, [advertiser, campaign, dates.from, dates.to])

  const { data, err } = usePerformanceSlice(filters, 'creative_id')

  const [pca, setPca] = useState<CampaignCreativePcaResponse | null>(null)
  const [pcaErr, setPcaErr] = useState<string | null>(null)
  const [pcaLoading, setPcaLoading] = useState(true)

  useEffect(() => {
    if (!campaign?.campaign_id) return
    let cancelled = false
    const cid = campaign.campaign_id
    setPcaLoading(true)
    setPca(null)
    setPcaErr(null)
    void fetchCampaignCreativePca(cid)
      .then((d) => {
        if (!cancelled) {
          setPca(d)
          setPcaLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setPcaErr(String(e))
          setPcaLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [campaign?.campaign_id])

  const insightPack = useMemo(() => {
    if (!advertiser || !campaign || !dates.from || !dates.to) return null
    if (!data?.summary) return null
    if (pcaLoading) return null
    return buildPerformanceInsightContext({
      entity: 'campaign',
      headline: campaign.label,
      subtitleLines: [
        `Advertiser: ${advertiser.label}`,
        `Campaign ID ${campaign.campaign_id}`,
        `${campaign.creatives.length} creatives in this campaign`,
      ],
      dateFrom: dates.from,
      dateTo: dates.to,
      data,
      campaignPortfolio: {
        creatives: campaign.creatives,
        pca: pcaErr ? null : pca,
        pcaFetchError: pcaErr,
      },
    })
  }, [advertiser, campaign, dates.from, dates.to, data, pcaLoading, pca, pcaErr])

  if (loadErr) {
    return <p className={explorerUi.errorMessage}>{loadErr}</p>
  }

  if (advertisers && (!advertiser || !campaign)) {
    return (
      <div className={explorerUi.notFoundWrap}>
        <BackNavLink to={pathHome()}>{UI_COPY.backToAdvertisers}</BackNavLink>
        <p className={explorerUi.notFoundBody}>{UI_COPY.campaignNotFound}</p>
      </div>
    )
  }

  if (!advertiser || !campaign) {
    return <p className={explorerUi.mutedMessage}>{UI_COPY.loading}</p>
  }

  return (
    <div className={explorerUi.pageWrap}>
      <div className={explorerUi.headerRow}>
        <div>
          <BackNavLink to={pathAdvertiser(advertiser.slug)}>← {advertiser.label}</BackNavLink>
          <h1 className={explorerUi.title}>{campaign.label}</h1>
          <p className={explorerUi.subtitle}>Campaign #{campaign.campaign_id}</p>
        </div>
        <DateRangeFields dateRange={dateRange} dates={dates} onChange={setDates} />
      </div>

      <div>
        <PerformanceResultPanels
          data={data}
          err={err}
          breakdownTitle={null}
          compactMetrics
          lockDailySeriesToKpiGoal
          kpiGoal={campaign.kpi_goal ?? null}
        />
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
        <div className="min-w-0 flex-[1.15] lg:max-w-[min(100%,40rem)]">
          <CampaignCreativePcaSection data={pca} error={pcaErr} loading={pcaLoading} />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-w-[min(100%,18rem)]">
          {pcaLoading ? (
            <div className="surface-panel flex min-h-[8rem] flex-1 items-center justify-center border-stone-200/80 text-sm text-stone-500 lg:min-h-[12rem]">
              Loading portfolio data for insight…
            </div>
          ) : (
            <LlmInsightPanel
              context={insightPack?.context ?? null}
              insightMode={insightPack?.insightMode}
              performanceError={err}
              panelClassName="mt-0 flex min-h-[8rem] flex-1 flex-col lg:min-h-[12rem]"
            />
          )}
        </div>
      </div>

      <div>
        <h2 className={explorerUi.sectionTitle}>{PAGE_SECTION.creatives}</h2>
        <div className="w-full overflow-x-auto pb-1 md:overflow-visible md:pb-0">
          <div className="grid min-w-[720px] grid-cols-6 items-start gap-2 sm:gap-3 md:min-w-0">
            {campaign.creatives.map((cr) => (
              <div key={cr.creative_id} className="min-w-0">
                <ExplorerCreativeCard
                  to={pathCreative(advertiser.slug, campaign.slug, cr.slug)}
                  label={`#${cr.creative_id}`}
                  title={cr.label}
                  creativeId={cr.creative_id}
                  creativeStatus={cr.creative_status}
                  isFatigued={cr.is_fatigued}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
