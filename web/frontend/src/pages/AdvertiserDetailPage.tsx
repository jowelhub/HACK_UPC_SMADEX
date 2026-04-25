import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackNavLink } from '../components/BackNavLink'
import { DateRangeFields } from '../components/DateRangeFields'
import { LlmInsightPanel } from '../components/LlmInsightPanel'
import { PerformanceResultPanels } from '../components/PerformanceResultPanels'
import { useExplorerBootstrap } from '../hooks/useExplorerBootstrap'
import { usePerformanceSlice } from '../hooks/usePerformanceSlice'
import { findAdvertiserBySlug } from '../lib/hierarchyResolve'
import {
  BREAKDOWN_CHART_TITLE,
  PAGE_SECTION,
  PERFORMANCE_SECTION,
  UI_COPY,
  formatMetaLine,
} from '../lib/performanceLabels'
import { buildAdvertiserFilters } from '../lib/performanceQueryDefaults'
import { buildPerformanceInsightContext } from '../lib/performanceInsightContext'
import { pathCampaign, pathHome } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'

export function AdvertiserDetailPage() {
  const { advertiserSlug } = useParams<{ advertiserSlug: string }>()
  const { advertisers, error: loadErr, dateRange, dates, setDates } = useExplorerBootstrap()

  const advertiser = useMemo(() => findAdvertiserBySlug(advertisers, advertiserSlug), [advertisers, advertiserSlug])

  const filters = useMemo(() => {
    if (!advertiser || !dates.from || !dates.to) return null
    return buildAdvertiserFilters(advertiser.advertiser_id, dates)
  }, [advertiser, dates.from, dates.to])

  const { data, err } = usePerformanceSlice(filters, 'campaign_id')

  const insightContext = useMemo(
    () =>
      advertiser && dates.from && dates.to
        ? buildPerformanceInsightContext({
            entity: 'advertiser',
            headline: advertiser.label,
            subtitleLines: [
              formatMetaLine(advertiser.vertical, advertiser.hq_region),
              `Advertiser ID ${advertiser.advertiser_id}`,
              `${advertiser.campaigns.length} campaigns in hierarchy`,
            ],
            dateFrom: dates.from,
            dateTo: dates.to,
            data,
          })
        : null,
    [advertiser, dates.from, dates.to, data],
  )

  if (loadErr) {
    return <p className={explorerUi.errorMessage}>{loadErr}</p>
  }

  if (advertisers && !advertiser) {
    return (
      <div className={explorerUi.notFoundWrap}>
        <BackNavLink to={pathHome()}>{UI_COPY.backToAdvertisers}</BackNavLink>
        <p className={explorerUi.notFoundBody}>{UI_COPY.noAdvertiserMatch}</p>
      </div>
    )
  }

  if (!advertiser) {
    return <p className={explorerUi.mutedMessage}>{UI_COPY.loading}</p>
  }

  return (
    <div className={explorerUi.pageWrap}>
      <div className={explorerUi.headerRow}>
        <div>
          <BackNavLink to={pathHome()}>{UI_COPY.backToAdvertisers}</BackNavLink>
          <h1 className={explorerUi.title}>{advertiser.label}</h1>
          <p className={explorerUi.subtitle}>{formatMetaLine(advertiser.vertical, advertiser.hq_region)}</p>
        </div>
        <DateRangeFields dateRange={dateRange} dates={dates} onChange={setDates} />
      </div>

      <div>
        <h2 className={explorerUi.performanceLabel}>{PERFORMANCE_SECTION.heading}</h2>
        <PerformanceResultPanels
          data={data}
          err={err}
          breakdownTitle={BREAKDOWN_CHART_TITLE.byCampaign}
          compactMetrics
        />
        <LlmInsightPanel context={insightContext} performanceError={err} />
      </div>

      <div>
        <h2 className={explorerUi.sectionTitle}>{PAGE_SECTION.campaigns}</h2>
        <div className="flex flex-col gap-2 sm:max-w-2xl">
          {advertiser.campaigns.map((c) => (
            <Link key={c.campaign_id} to={pathCampaign(advertiser.slug, c.slug)} className={explorerUi.campaignNavButton}>
              {c.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
