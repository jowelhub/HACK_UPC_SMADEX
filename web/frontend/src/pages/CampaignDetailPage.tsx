import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { BackNavLink } from '../components/BackNavLink'
import { DateRangeFields } from '../components/DateRangeFields'
import { ExplorerCreativeCard } from '../components/ExplorerCreativeCard'
import { PerformanceResultPanels } from '../components/PerformanceResultPanels'
import { useExplorerBootstrap } from '../hooks/useExplorerBootstrap'
import { usePerformanceSlice } from '../hooks/usePerformanceSlice'
import { findAdvertiserBySlug, findCampaignBySlug } from '../lib/hierarchyResolve'
import {
  BREAKDOWN_CHART_TITLE,
  PAGE_SECTION,
  PERFORMANCE_SECTION,
  UI_COPY,
} from '../lib/performanceLabels'
import { buildCampaignFilters } from '../lib/performanceQueryDefaults'
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
        <h2 className={explorerUi.performanceLabel}>{PERFORMANCE_SECTION.heading}</h2>
        <PerformanceResultPanels
          data={data}
          err={err}
          breakdownTitle={BREAKDOWN_CHART_TITLE.byCreative}
          compactMetrics
        />
      </div>

      <div>
        <h2 className={explorerUi.sectionTitle}>{PAGE_SECTION.creatives}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {campaign.creatives.map((cr) => (
            <ExplorerCreativeCard
              key={cr.creative_id}
              to={pathCreative(advertiser.slug, campaign.slug, cr.slug)}
              label={cr.label}
              creativeId={cr.creative_id}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
