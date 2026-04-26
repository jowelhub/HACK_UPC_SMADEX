import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackNavLink } from '../components/BackNavLink'
import { useExplorerBootstrap } from '../hooks/useExplorerBootstrap'
import { findAdvertiserBySlug } from '../lib/hierarchyResolve'
import { PAGE_SECTION, UI_COPY, formatMetaLine } from '../lib/performanceLabels'
import { pathCampaign, pathHome } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'

export function AdvertiserDetailPage() {
  const { advertiserSlug } = useParams<{ advertiserSlug: string }>()
  const { advertisers, error: loadErr } = useExplorerBootstrap()

  const advertiser = useMemo(() => findAdvertiserBySlug(advertisers, advertiserSlug), [advertisers, advertiserSlug])

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
      </div>

      <div>
        <h2 className={explorerUi.sectionTitle}>{PAGE_SECTION.campaigns}</h2>
        <div className="flex flex-col gap-2 sm:max-w-2xl">
          {advertiser.campaigns.map((c) => (
            <Link key={c.campaign_id} to={pathCampaign(advertiser.slug, c.slug)} className={explorerUi.campaignNavButton}>
              <span className="block font-medium">{c.label}</span>
              <span className="mt-1 block text-xs font-normal text-stone-500">
                KPI goal: {(c.kpi_goal ?? 'none').trim() || 'none'}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
